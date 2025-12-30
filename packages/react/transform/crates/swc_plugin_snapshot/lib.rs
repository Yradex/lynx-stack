use serde::Deserialize;
use std::{
  cell::RefCell,
  collections::{BTreeMap, HashMap, HashSet},
};

use once_cell::sync::Lazy;
use swc_core::{
  atoms as swc_atoms,
  common::{
    comments::{CommentKind, Comments},
    errors::HANDLER,
    util::take::Take,
    Mark, Span, Spanned, SyntaxContext, DUMMY_SP,
  },
  ecma::{
    ast::{JSXExpr, *},
    utils::{is_literal, prepend_stmt, private_ident},
    visit::{VisitMut, VisitMutWith},
  },
  quote, quote_expr,
};

mod attr_name;
mod slot_marker;

use serde::Serialize;
use std::rc::Rc;

#[derive(Serialize, Debug, Clone)]
pub struct ElementTemplateAsset {
  pub template_id: String,
  pub compiled_template: serde_json::Value,
  pub source_file: String,
}

pub mod napi;

use swc_plugins_shared::{
  css::get_string_inline_style_from_literal,
  jsx_helpers::{
    jsx_attr_name, jsx_attr_to_prop, jsx_attr_value, jsx_children_to_expr,
    jsx_is_children_full_dynamic, jsx_is_custom, jsx_is_list, jsx_is_list_item, jsx_name,
    jsx_props_to_obj, jsx_text_to_str, transform_jsx_attr_str,
  },
  target::TransformTarget,
  transform_mode::TransformMode,
  utils::calc_hash,
};

use self::{
  attr_name::AttrName,
  slot_marker::{jsx_is_internal_slot, jsx_unwrap_internal_slot, WrapperMarker},
};

// impl From<i32> for Expr {
//     fn from(value: i32) -> Self {
//         Expr::Lit(Lit::Num(Number {
//             span: DUMMY_SP,
//             value: value as f64,
//             raw: None,
//         }))
//     }
// }

static WRAPPER_NODE: Lazy<JSXElement> = Lazy::new(|| JSXElement {
  span: DUMMY_SP,
  opening: JSXOpeningElement {
    span: DUMMY_SP,
    name: JSXElementName::Ident(Ident::new(
      "wrapper".into(),
      DUMMY_SP,
      SyntaxContext::default(),
    )),
    attrs: vec![],
    self_closing: true,
    type_args: None,
  },
  closing: None,
  children: vec![],
});

static WRAPPER_NODE_2: Lazy<JSXElement> = Lazy::new(|| JSXElement {
  span: DUMMY_SP,
  opening: JSXOpeningElement {
    span: DUMMY_SP,
    name: JSXElementName::Ident(Ident::new(
      "wrapper".into(),
      DUMMY_SP,
      SyntaxContext::default(),
    )),
    attrs: vec![],
    self_closing: false,
    type_args: None,
  },
  closing: Some(JSXClosingElement {
    span: DUMMY_SP,
    name: JSXElementName::Ident(Ident::new(
      "wrapper".into(),
      DUMMY_SP,
      SyntaxContext::default(),
    )),
  }),
  children: vec![],
});

static NO_FLATTEN_ATTRIBUTES: Lazy<HashSet<String>> = Lazy::new(|| {
  HashSet::from([
    "name".to_string(),
    "clip-radius".to_string(),
    "overlap".to_string(),
    "exposure-scene".to_string(),
    "exposure-id".to_string(),
  ])
});

#[derive(Debug)]
pub enum DynamicPart {
  Attr(Expr, i32, AttrName),
  Spread(Expr, i32),
  Slot(Vec<JSXElementChild>, i32),
  Children(Expr, i32),
  ListChildren(Expr, i32),
}

pub fn i32_to_expr(i: &i32) -> Expr {
  Expr::Lit(Lit::Num(Number {
    span: DUMMY_SP,
    value: *i as f64,
    raw: None,
  }))
}

fn bool_jsx_attr(value: bool) -> JSXAttrValue {
  JSXAttrValue::JSXExprContainer(JSXExprContainer {
    span: DUMMY_SP,
    expr: JSXExpr::Expr(Box::new(Expr::Lit(Lit::Bool(Bool {
      span: DUMMY_SP,
      value,
    })))),
  })
}

fn wrap_in_slot(slot_ident: &Ident, id: i32, children: Vec<JSXElementChild>) -> JSXElementChild {
  let slot_name = JSXElementName::Ident(slot_ident.clone());
  JSXElementChild::JSXElement(Box::new(JSXElement {
    span: DUMMY_SP,
    opening: JSXOpeningElement {
      span: DUMMY_SP,
      name: slot_name.clone(),
      attrs: vec![JSXAttrOrSpread::JSXAttr(JSXAttr {
        span: DUMMY_SP,
        name: JSXAttrName::Ident(IdentName::new("id".into(), DUMMY_SP)),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
          span: DUMMY_SP,
          expr: JSXExpr::Expr(Box::new(i32_to_expr(&id))),
        })),
      })],
      self_closing: false,
      type_args: None,
    },
    closing: Some(JSXClosingElement {
      span: DUMMY_SP,
      name: slot_name,
    }),
    children,
  }))
}

impl DynamicPart {
  fn to_updater(&self, runtime_id: Expr, target: TransformTarget, exp_index: i32) -> Expr {
    match target {
      TransformTarget::LEPUS | TransformTarget::MIXED => match self {
        DynamicPart::Attr(_, element_index, attr_name) => match attr_name {
          AttrName::Attr(name) => quote!(
            "function (ctx) {
              if (ctx.__elements) {
                __SetAttribute(ctx.__elements[$element_index], $name, ctx.__values[$exp_index]);
              }
            }" as Expr,
            name: Expr = Expr::Lit(Lit::Str(name.clone().into())),
            element_index: Expr = i32_to_expr(element_index),
            exp_index: Expr = i32_to_expr(&exp_index),
          ),
          AttrName::TimingFlag => quote!(
            "function (ctx) {
              if (ctx.__elements) {
                __SetAttribute(ctx.__elements[$element_index], '__lynx_timing_flag', ctx.__values[$exp_index].__ltf);
              }
            }" as Expr,
            element_index: Expr = i32_to_expr(element_index),
            exp_index: Expr = i32_to_expr(&exp_index),
          ),
          AttrName::Dataset(name) => quote!(
            "function (ctx) {
              if (ctx.__elements) {
                __AddDataset(ctx.__elements[$element_index], $name, ctx.__values[$exp_index]);
              }
            }" as Expr,
            name: Expr = Expr::Lit(Lit::Str(name.clone().into())),
            element_index: Expr = i32_to_expr(element_index),
            exp_index: Expr = i32_to_expr(&exp_index),
          ),
          AttrName::Style => quote!(
            "function (ctx) {
              if (ctx.__elements) {
                __SetInlineStyles(ctx.__elements[$element_index], ctx.__values[$exp_index]);
              }
            }" as Expr,
            element_index: Expr = i32_to_expr(element_index),
            exp_index: Expr = i32_to_expr(&exp_index),
          ),
          AttrName::Class => quote!(
            "function (ctx) {
              if (ctx.__elements) {
                __SetClasses(ctx.__elements[$element_index], ctx.__values[$exp_index] || '');
              }
            }" as Expr,
            element_index: Expr = i32_to_expr(element_index),
            exp_index: Expr = i32_to_expr(&exp_index),
          ),
          AttrName::ID => quote!(
            "function (ctx) {
              if (ctx.__elements) {
                __SetID(ctx.__elements[$element_index], ctx.__values[$exp_index]);
              }
            }" as Expr,
            element_index: Expr = i32_to_expr(element_index),
            exp_index: Expr = i32_to_expr(&exp_index),
          ),
          AttrName::Event(event_type, event_name) => quote!(
            "(snapshot, index, oldValue) => $runtime_id.updateEvent(snapshot, index, oldValue, $element_index, $event_type, $event_name, '')" as Expr,
            runtime_id: Expr = runtime_id.clone(),
            event_type: Expr = Expr::Lit(Lit::Str(event_type.clone().into())),
            event_name: Expr = Expr::Lit(Lit::Str(event_name.clone().into())),
            element_index: Expr = i32_to_expr(element_index),
          ),
          AttrName::WorkletEvent(worklet_type, event_type, event_name) => quote!(
            "(snapshot, index, oldValue) => $runtime_id.updateWorkletEvent(snapshot, index, oldValue, $element_index, $worklet_type, $event_type, $event_name)" as Expr,
            runtime_id: Expr = runtime_id.clone(),
            worklet_type: Expr = Expr::Lit(Lit::Str(worklet_type.clone().into())),
            event_type: Expr = Expr::Lit(Lit::Str(event_type.clone().into())),
            event_name: Expr = Expr::Lit(Lit::Str(event_name.clone().into())),
            element_index: Expr = i32_to_expr(element_index),
          ),
          AttrName::Ref => quote!(
            "(snapshot, index, oldValue) => $runtime_id.updateRef(snapshot, index, oldValue, $element_index)" as Expr,
            runtime_id: Expr = runtime_id.clone(),
            element_index: Expr = i32_to_expr(element_index),
          ),
          AttrName::WorkletRef(worklet_type) => quote!(
            "(snapshot, index, oldValue) => $runtime_id.updateWorkletRef(snapshot, index, oldValue, $element_index, $worklet_type)" as Expr,
            runtime_id: Expr = runtime_id.clone(),
            element_index: Expr = i32_to_expr(element_index),
            worklet_type: Expr = Expr::Lit(Lit::Str(worklet_type.clone().into())),
          ),
          AttrName::ListItemPlatformInfo => quote!(
            "(snapshot, index, oldValue) => $runtime_id.updateListItemPlatformInfo(snapshot, index, oldValue, $element_index)" as Expr,
            runtime_id: Expr = runtime_id.clone(),
            element_index: Expr = i32_to_expr(element_index),
          ),
          AttrName::Gesture(ns) => quote!(
            "(snapshot, index, oldValue) => $runtime_id.updateGesture(snapshot, index, oldValue, $element_index, $ns)" as Expr,
            runtime_id: Expr = runtime_id.clone(),
            element_index: Expr = i32_to_expr(element_index),
            ns: Expr = Expr::Lit(Lit::Str(ns.clone().into())),
          ),
        },
        DynamicPart::Spread(_, element_index) => quote!(
          "(snapshot, index, oldValue) => $runtime_id.updateSpread(snapshot, index, oldValue, $element_index)" as Expr,
          runtime_id: Expr = runtime_id.clone(),
          element_index: Expr = i32_to_expr(element_index)
        ),
        DynamicPart::Slot(_, _) => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
        DynamicPart::Children(_, _) => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
        DynamicPart::ListChildren(_, _) => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
      },
      TransformTarget::JS => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
    }
  }
}

pub struct DynamicPartExtractor<'a, V>
where
  V: VisitMut,
{
  page_id: Lazy<Ident>,
  runtime_id: Expr,
  parent_element: Option<Ident>,
  element_index: i32,
  element_ids: HashMap<i32, Ident>,
  static_stmts: Vec<RefCell<Stmt>>,
  si_id: Lazy<Ident>,
  snapshot_creator: Option<Function>,
  dynamic_part_count: i32,
  dynamic_parts: Vec<DynamicPart>,
  dynamic_part_visitor: &'a mut V,
  key: Option<JSXAttrValue>,
  id_counter: i32,
  enable_element_template: bool,
}

impl<'a, V> DynamicPartExtractor<'a, V>
where
  V: VisitMut,
{
  fn new(
    runtime_id: Expr,
    dynamic_part_count: i32,
    dynamic_part_visitor: &'a mut V,
    enable_element_template: bool,
  ) -> Self {
    DynamicPartExtractor {
      page_id: Lazy::new(|| private_ident!("pageId")),
      runtime_id,
      parent_element: None,
      element_index: 0,
      element_ids: HashMap::new(),
      static_stmts: vec![],
      si_id: Lazy::new(|| private_ident!("snapshotInstance")),
      snapshot_creator: None,
      dynamic_part_count,
      dynamic_parts: vec![],
      dynamic_part_visitor,
      key: None,
      id_counter: 0,
      enable_element_template,
    }
  }

  fn static_stmt_from_jsx_element(&mut self, n: &JSXElement, el: Ident) -> Stmt {
    let mut static_stmt: Stmt = Stmt::Empty(EmptyStmt { span: DUMMY_SP });

    if let Expr::Lit(Lit::Str(str)) = *jsx_name(n.opening.name.clone()) {
      let tag = str.value.to_string_lossy();
      match tag.as_ref() {
        "view" => {
          static_stmt = quote!(
            r#"const $element = __CreateView($page_id)"# as Stmt,
            element = el.clone(),
            page_id = self.page_id.clone(),
          );
        }
        "scroll-view" => {
          static_stmt = quote!(
            r#"const $element = __CreateScrollView($page_id)"# as Stmt,
            element = el.clone(),
            page_id = self.page_id.clone(),
          );
        }
        "x-scroll-view" => {
          static_stmt = quote!(
            r#"const $element = __CreateScrollView($page_id, { tag: "x-scroll-view" })"# as Stmt,
            element = el.clone(),
            page_id = self.page_id.clone(),
          );
        }
        "image" => {
          static_stmt = quote!(
            r#"const $element = __CreateImage($page_id)"# as Stmt,
            element = el.clone(),
            page_id = self.page_id.clone(),
          );
        }
        "text" => {
          static_stmt = quote!(
            r#"const $element = __CreateText($page_id)"# as Stmt,
            element = el.clone(),
            page_id = self.page_id.clone(),
          );
        }
        "wrapper" => {
          static_stmt = quote!(
            r#"const $element = __CreateWrapperElement($page_id)"# as Stmt,
            element = el.clone(),
            page_id = self.page_id.clone(),
          );
        }
        "list" => {
          static_stmt = quote!(
              r#"const $element = $runtime_id.snapshotCreateList($page_id, $si_id, $element_index)"#
                  as Stmt,
              element = el.clone(),
              runtime_id: Expr = self.runtime_id.clone(),
              page_id = self.page_id.clone(),
              si_id = self.si_id.clone(),
              element_index: Expr = Expr::Lit(Lit::Num(Number { span: DUMMY_SP, value: self.element_index as f64, raw: None })),
          );
        }
        "frame" => {
          static_stmt = quote!(
            r#"const $element = __CreateFrame($page_id)"# as Stmt,
            element = el.clone(),
            page_id = self.page_id.clone(),
          );
        }
        _ => {
          static_stmt = quote!(
              r#"const $element = __CreateElement($name, $page_id)"# as Stmt,
              element = el.clone(),
              name: Expr = Expr::Lit(Lit::Str(str)),
              page_id = self.page_id.clone(),
          );
        }
      };
    }

    static_stmt
  }
}

impl<V> VisitMut for DynamicPartExtractor<'_, V>
where
  V: VisitMut,
{
  fn visit_mut_jsx_element(&mut self, n: &mut JSXElement) {
    if jsx_is_internal_slot(n) {
      if self.dynamic_part_count > 1 || self.enable_element_template {
        n.visit_mut_children_with(self.dynamic_part_visitor);
        let id = if self.enable_element_template {
          let id = self.id_counter;
          self.id_counter += 1;
          id
        } else {
          self.element_index
        };

        if self.enable_element_template {
          let wrapper = jsx_unwrap_internal_slot(n.take());
          let children = wrapper.children;
          if !children.is_empty() {
            self.dynamic_parts.push(DynamicPart::Slot(children, id));
          }
        } else {
          self.dynamic_parts.push(DynamicPart::Slot(
            vec![JSXElementChild::JSXElement(Box::new(
              jsx_unwrap_internal_slot(n.take()),
            ))],
            id,
          ));
        }
        let mut wrapper = WRAPPER_NODE_2.clone();
        if self.enable_element_template {
          wrapper
            .opening
            .attrs
            .push(JSXAttrOrSpread::JSXAttr(JSXAttr {
              span: DUMMY_SP,
              name: JSXAttrName::Ident(IdentName::new("__lynx_part_id".into(), DUMMY_SP)),
              value: Some(JSXAttrValue::Str(Str {
                span: DUMMY_SP,
                value: id.to_string().into(),
                raw: None,
              })),
            }));
        }
        *n = wrapper;
      } else {
        *n = jsx_unwrap_internal_slot(n.take());
      }
    }

    if !jsx_is_custom(n) {
      match Lazy::<Ident>::get(&self.page_id) {
        Some(_) => {}
        None => {
          self.static_stmts.push(RefCell::new(quote!(
            r#"const $page_id = $runtime_id.__pageId"# as Stmt,
            page_id = self.page_id.clone(),
            runtime_id: Expr = self.runtime_id.clone(),
          )));
        }
      }

      let el = private_ident!("el");
      self.element_ids.insert(self.element_index, el.clone());

      let static_stmt = self.static_stmt_from_jsx_element(n, el.clone());
      let static_stmt = RefCell::new(static_stmt);
      self.static_stmts.push(static_stmt.clone());

      {
        let mut flatten = None;
        for attr in &n.opening.attrs {
          if let JSXAttrOrSpread::JSXAttr(attr) = attr {
            let name = jsx_attr_name(&attr.name.clone()).to_string();
            if NO_FLATTEN_ATTRIBUTES.contains(&name) {
              flatten = Some(JSXAttrOrSpread::JSXAttr(JSXAttr {
                span: DUMMY_SP,
                name: JSXAttrName::Ident(IdentName::new("flatten".into(), DUMMY_SP)),
                value: Some(bool_jsx_attr(false)),
              }));
              break;
            }
          }
        }

        if let Some(flatten) = flatten {
          let mut has_origin_flatten = false;
          for attr in &mut n.opening.attrs {
            if let JSXAttrOrSpread::JSXAttr(attr) = attr {
              let name = jsx_attr_name(&attr.name.clone()).to_string();
              if name == *"flatten" {
                attr.value = Some(bool_jsx_attr(false));
                has_origin_flatten = true;
              }
            }
          }
          if !has_origin_flatten {
            n.opening.attrs.push(flatten);
          }
        }
      }

      let has_spread_element = n
        .opening
        .attrs
        .iter()
        .any(|attr_or_spread| match attr_or_spread {
          JSXAttrOrSpread::SpreadElement(_) => true,
          JSXAttrOrSpread::JSXAttr(_) => false,
        });

      if jsx_is_list_item(n) {
        if has_spread_element {
        } else {
          let mut list_item_platform_info: Vec<JSXAttr> = vec![];
          n.opening.attrs.retain_mut(|attr_or_spread| {
            match attr_or_spread {
              JSXAttrOrSpread::JSXAttr(attr) => {
                if let JSXAttrName::Ident(id) = &attr.name {
                  match id.sym.to_string().as_str() {
                    "reuse-identifier"
                    | "full-span"
                    | "item-key"
                    | "sticky-top"
                    | "sticky-bottom"
                    | "estimated-height"
                    | "estimated-height-px"
                    | "estimated-main-axis-size-px"
                    | "recyclable" => {
                      list_item_platform_info.push(attr.clone());
                      return false;
                    }
                    &_ => {}
                  }
                }
              }
              JSXAttrOrSpread::SpreadElement(_spread) => {
                return false;
              }
            }

            true
          });
          if !list_item_platform_info.is_empty() {
            self.dynamic_parts.push(DynamicPart::Attr(
              Expr::Object(ObjectLit {
                span: DUMMY_SP,
                props: list_item_platform_info
                  .iter()
                  .map(jsx_attr_to_prop)
                  .collect(),
              }),
              self.element_index,
              AttrName::ListItemPlatformInfo,
            ));
          }
        }
      }

      // pick key from n.opening.attrs
      n.opening
        .attrs
        .retain_mut(|attr_or_spread| match attr_or_spread {
          JSXAttrOrSpread::SpreadElement(_) => true,
          JSXAttrOrSpread::JSXAttr(JSXAttr { name, value, .. }) => match name {
            JSXAttrName::Ident(ident_name) => match ident_name.sym.as_ref() {
              "key" => {
                if self.parent_element.is_none() {
                  self.key = value.take();
                }
                false
              }
              _ => true,
            },
            JSXAttrName::JSXNamespacedName(_) => true,
          },
        });

      if has_spread_element {
        // TODO: avoid clone
        let mut spread_obj = jsx_props_to_obj(n).unwrap();
        spread_obj.props.push(
          Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(IdentName::new("__spread".into(), DUMMY_SP)),
            value: Expr::Lit(Lit::Bool(true.into())).into(),
          })
          .into(),
        );
        self.dynamic_parts.push(DynamicPart::Spread(
          Expr::Object(spread_obj),
          self.element_index,
        ));
      } else {
        let el = Expr::Ident(el.clone());

        n.opening
          .attrs
          .iter_mut()
          .for_each(|attr_or_spread| match attr_or_spread {
            JSXAttrOrSpread::SpreadElement(_) => todo!(),
            JSXAttrOrSpread::JSXAttr(JSXAttr { name, value, .. }) => {
              match name {
                JSXAttrName::Ident(ident_name) => {
                  let attr_name = AttrName::from(<IdentName as Into<Ident>>::into(ident_name.clone()));
                  match &attr_name {
                    AttrName::Attr(name) => {
                      match value {
                        None => {
                          let stmt = quote!(
                              r#"__SetAttribute($element, $name, $value)"# as Stmt,
                              element: Expr = el.clone(),
                              name: Expr = name.clone().into(),
                              value: Expr = Expr::Lit(Lit::Bool(Bool {span: DUMMY_SP, value: true}))
                          );
                          self.static_stmts.push(RefCell::new(stmt));
                        }
                        Some(JSXAttrValue::Str(s)) => {
                          let value = transform_jsx_attr_str(&s.value);
                          let stmt = quote!(
                              r#"__SetAttribute($element, $name, $value)"# as Stmt,
                              element: Expr = el.clone(),
                              name: Expr =  name.clone().into(),
                              value: Expr = Expr::Lit(Lit::Str(Str { span: s.span, value: value.into(), raw: None }))
                          );
                          self.static_stmts.push(RefCell::new(stmt));
                        }
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                          expr: JSXExpr::Expr(expr),
                          ..
                        })) => {
                          // expr.map_with_mut(|value| {
                          //     value.fold_with(self.dynamic_part_visitor)
                          // });
                          match &**expr {
                            Expr::Lit(value) => {
                              let stmt = quote!(
                                  r#"__SetAttribute($element, $name, $value)"# as Stmt,
                                  element: Expr = el.clone(),
                                  name: Expr =  name.clone().into(),
                                  value: Expr = Expr::Lit(value.clone())
                              );
                              self.static_stmts.push(RefCell::new(stmt));
                            }
                            _ => {
                              self.dynamic_parts.push(DynamicPart::Attr(
                                *expr.clone(),
                                self.element_index,
                                attr_name.clone(),
                              ));
                            }
                          }
                        }
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                          expr: JSXExpr::JSXEmptyExpr(_),
                          ..
                        })) => {}
                        Some(JSXAttrValue::JSXElement(_)) => unreachable!("Unexpected JSXElement in JSX attribute value - not supported"),
                        Some(JSXAttrValue::JSXFragment(_)) => unreachable!("Unexpected JSXFragment in JSX attribute value - not supported"),
                      };
                    }
                    AttrName::Dataset(name) => {
                      match value {
                        None => {
                          let stmt = quote!(
                              r#"__AddDataset($element, $name, $value)"# as Stmt,
                              element: Expr = el.clone(),
                              name: Expr =  name.clone().into(),
                              value: Expr = Expr::Lit(Lit::Bool(Bool {span: DUMMY_SP, value: true}))
                          );
                          self.static_stmts.push(RefCell::new(stmt));
                        }
                        Some(JSXAttrValue::Str(s)) => {
                          let value = transform_jsx_attr_str(&s.value);
                          let stmt = quote!(
                              r#"__AddDataset($element, $name, $value)"# as Stmt,
                              element: Expr = el.clone(),
                              name: Expr =  name.clone().into(),
                              value: Expr = Expr::Lit(Lit::Str(Str { span: s.span, value: value.into(), raw: None }))
                          );
                          self.static_stmts.push(RefCell::new(stmt));
                        }
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                          expr: JSXExpr::Expr(expr),
                          ..
                        })) => {
                          self.dynamic_parts.push(DynamicPart::Attr(
                            *expr.clone(),
                            self.element_index,
                            attr_name.clone(),
                          ));
                        }
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                          expr: JSXExpr::JSXEmptyExpr(_),
                          ..
                        })) => {}
                        Some(JSXAttrValue::JSXElement(_)) => unreachable!("Unexpected JSXElement in JSX attribute value - not supported"),
                        Some(JSXAttrValue::JSXFragment(_)) => unreachable!("Unexpected JSXFragment in JSX attribute value - not supported"),
                      };
                    }
                    AttrName::Event(..) | AttrName::Ref => {
                      self.dynamic_parts.push(DynamicPart::Attr(
                        *jsx_attr_value((*value).clone()),
                        self.element_index,
                        attr_name.clone(),
                      ));
                    }
                    AttrName::TimingFlag => {
                      self.dynamic_parts.push(DynamicPart::Attr(
                        *quote_expr!("{__ltf: $flag}", flag: Expr = *jsx_attr_value((*value).clone())),
                        self.element_index,
                        attr_name.clone(),
                      ));
                    }
                    AttrName::Style => {
                      let mut static_style_val = None;
                      if let Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                        expr: JSXExpr::Expr(expr),
                        span,
                        ..
                      })) = value
                      {
                        let expr = &**expr;
                        if is_literal(expr) {
                          if let Some(s) = get_string_inline_style_from_literal(expr, span) {
                            static_style_val = Some((s, *span));
                          }
                        }
                      }

                      if let Some((s_val, span)) = static_style_val {
                        if self.enable_element_template {
                          *value = Some(JSXAttrValue::Str(Str {
                            span,
                            value: s_val.into(),
                            raw: None,
                          }));
                        } else {
                          // <view style={{backgroundColor: "red"}} />;
                          // <view style={`background-color: red;`} />;
                          let s = Lit::Str(Str {
                            span,
                            value: s_val.into(),
                            raw: None,
                          });
                          let stmt = quote!(
                            r#"__SetInlineStyles($element, $value)"# as Stmt,
                            element: Expr = el.clone(),
                            value: Expr = Expr::Lit(s)
                          );
                          self.static_stmts.push(RefCell::new(stmt));
                        }
                      } else {
                        match value {
                          None => {}
                          Some(JSXAttrValue::Str(s)) => {
                            // <view style="width: 100rpx" />;
                            let value = transform_jsx_attr_str(&s.value);
                            let stmt = quote!(
                                r#"__SetInlineStyles($element, $value)"# as Stmt,
                                element: Expr = el.clone(),
                                value: Expr = Expr::Lit(Lit::Str(Str { span: s.span, value: value.into(), raw: None }))
                            );
                            self.static_stmts.push(RefCell::new(stmt));
                          }
                          Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                            expr: JSXExpr::Expr(expr),
                            ..
                          })) => {
                            self.dynamic_parts.push(DynamicPart::Attr(
                              *expr.clone(),
                              self.element_index,
                              attr_name.clone(),
                            ));
                          }
                          Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                            expr: JSXExpr::JSXEmptyExpr(_),
                            ..
                          })) => {}
                          Some(JSXAttrValue::JSXElement(_)) => unreachable!("Unexpected JSXElement in JSX attribute value - not supported"),
                          Some(JSXAttrValue::JSXFragment(_)) => unreachable!("Unexpected JSXFragment in JSX attribute value - not supported"),
                        }
                      }
                    }
                    AttrName::Class => {
                      match value {
                        None => {}
                        Some(JSXAttrValue::Str(s)) => {
                          let value = transform_jsx_attr_str(&s.value);
                          let stmt = quote!(
                              r#"__SetClasses($element, $value)"# as Stmt,
                              element: Expr = el.clone(),
                              value: Expr = Expr::Lit(Lit::Str(Str { span: s.span, value: value.into(), raw: None }))
                          );
                          self.static_stmts.push(RefCell::new(stmt));
                        }
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                          expr: JSXExpr::Expr(expr),
                          ..
                        })) => match &**expr {
                          Expr::Lit(value) => {
                            let stmt = quote!(
                                r#"__SetClasses($element, $value)"# as Stmt,
                                element: Expr = el.clone(),
                                value: Expr = Expr::Lit(value.clone())
                            );
                            self.static_stmts.push(RefCell::new(stmt));
                          }
                          _ => {
                            self.dynamic_parts.push(DynamicPart::Attr(
                              *expr.clone(),
                              self.element_index,
                              attr_name.clone(),
                            ));
                          }
                        },
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                          expr: JSXExpr::JSXEmptyExpr(_),
                          ..
                        })) => {}
                        Some(JSXAttrValue::JSXElement(_)) => unreachable!("Unexpected JSXElement in JSX attribute value - not supported"),
                        Some(JSXAttrValue::JSXFragment(_)) => unreachable!("Unexpected JSXFragment in JSX attribute value - not supported"),
                      };
                    }
                    AttrName::ID => {
                      match value {
                        None => {}
                        Some(JSXAttrValue::Str(s)) => {
                          let value = transform_jsx_attr_str(&s.value);
                          let stmt = quote!(
                              r#"__SetID($element, $value)"# as Stmt,
                              element: Expr = el.clone(),
                              value: Expr = Expr::Lit(Lit::Str(Str { span: s.span, value: value.into(), raw: None }))
                          );
                          self.static_stmts.push(RefCell::new(stmt));
                        }
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                          expr: JSXExpr::Expr(expr),
                          ..
                        })) => {
                          self.dynamic_parts.push(DynamicPart::Attr(
                            *expr.clone(),
                            self.element_index,
                            attr_name,
                          ));
                        }
                        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                          expr: JSXExpr::JSXEmptyExpr(_),
                          ..
                        })) => {}
                        Some(JSXAttrValue::JSXElement(_)) => unreachable!("Unexpected JSXElement in JSX attribute value - not supported"),
                        Some(JSXAttrValue::JSXFragment(_)) => unreachable!("Unexpected JSXFragment in JSX attribute value - not supported"),
                      };
                    }
                    AttrName::ListItemPlatformInfo => unreachable!("Unexpected ListItemPlatformInfo attribute in static JSX processing"),
                    AttrName::WorkletEvent(..) | AttrName::WorkletRef(..) => {
                      unreachable!("A worklet event should have an attribute namespace.")
                    }
                    AttrName::Gesture(..) => {
                      unreachable!("A gesture should have an attribute namespace.")
                    }
                  }
                }
                JSXAttrName::JSXNamespacedName(JSXNamespacedName { ns, name, .. }) => {
                  let attr_name: AttrName = AttrName::from_ns(ns.clone().into(), name.clone().into());
                  match attr_name {
                    AttrName::WorkletEvent(..) | AttrName::WorkletRef(..) => {
                      self.dynamic_parts.push(DynamicPart::Attr(
                        *jsx_attr_value((*value).clone()),
                        self.element_index,
                        attr_name.clone(),
                      ));
                    }
                    AttrName::Gesture(..) => {
                      self.dynamic_parts.push(DynamicPart::Attr(
                        *jsx_attr_value((*value).clone()),
                        self.element_index,
                        attr_name.clone(),
                      ));
                    }
                    _ => todo!(),
                  }
                }
              };
            }
          });
      }

      // Check if this element has any dynamic parts (Attr or Spread)
      let element_has_dynamic_parts = self.dynamic_parts.iter().any(|part| match part {
        DynamicPart::Attr(_, index, _) => *index == self.element_index,
        DynamicPart::Spread(_, index) => *index == self.element_index,
        _ => false,
      });

      if element_has_dynamic_parts && self.enable_element_template {
        let part_id = self.id_counter;
        self.id_counter += 1;

        self.dynamic_parts.iter_mut().for_each(|part| match part {
          DynamicPart::Attr(_, index, _) => {
            if *index == self.element_index {
              *index = part_id;
            }
          }
          DynamicPart::Spread(_, index) => {
            if *index == self.element_index {
              *index = part_id;
            }
          }
          _ => {}
        });

        n.opening.attrs.push(JSXAttrOrSpread::JSXAttr(JSXAttr {
          span: DUMMY_SP,
          name: JSXAttrName::Ident(IdentName::new("__lynx_part_id".into(), DUMMY_SP)),
          value: Some(JSXAttrValue::Str(Str {
            span: DUMMY_SP,
            value: part_id.to_string().into(),
            raw: None,
          })),
        }));
      }

      if let Some(parent_el) = &self.parent_element {
        self.static_stmts.push(RefCell::new(quote!(
            r#"__AppendElement($parent, $child)"# as Stmt,
            parent: Ident = parent_el.clone(),
            child: Ident = el.clone(),
        )));
      };

      let is_list = jsx_is_list(n);
      let is_children_full_dynamic = is_list || jsx_is_children_full_dynamic(n);

      if !is_children_full_dynamic {
        self.element_index += 1;

        let pre_parent_element = self.parent_element.take();
        self.parent_element = Some(el.clone());
        // n.children.iter_mut().for_each(|child| match child {
        //     JSXElementChild::JSXText(_) => {
        //         child.visit_mut_children_with(self);
        //     }
        //     JSXElementChild::JSXElement(_) => {
        //         child.visit_mut_children_with(self);
        //     }
        //     JSXElementChild::JSXFragment(_) => {
        //         child.visit_mut_children_with(self);
        //     }
        //     JSXElementChild::JSXExprContainer(JSXExprContainer {
        //         expr: JSXExpr::Expr(_expr),
        //         ..
        //     }) => {
        //         unreachable!("should be handled by WrapDynamicPart");
        //     }
        //     JSXElementChild::JSXExprContainer(JSXExprContainer {
        //         expr: JSXExpr::JSXEmptyExpr(_),
        //         ..
        //     }) => {
        //         // comment, just ignore
        //     }
        //     JSXElementChild::JSXSpreadChild(_) => {
        //         unreachable!("JSXSpreadChild is not supported yet");
        //     }
        // });

        n.visit_mut_children_with(self);

        self.parent_element = pre_parent_element;
      } else {
        if self.dynamic_part_count <= 1 {
          n.visit_mut_children_with(self.dynamic_part_visitor);
          let children_expr = jsx_children_to_expr(n.children.take());
          if is_list {
            self
              .dynamic_parts
              .push(DynamicPart::ListChildren(children_expr, self.element_index));
          } else {
            self
              .dynamic_parts
              .push(DynamicPart::Children(children_expr, self.element_index));
          }
        } else {
          // static_stmt.replace_with(|_| {
          //     let r = WRAPPER_NODE.clone();
          //     let (static_stmt, _) =
          //         self.static_stmt_from_jsx_element(&r, el.clone());
          //     static_stmt
          // });

          // n.map_with_mut(|value| value.fold_with(self.dynamic_part_visitor));
          // if is_list {
          //     // unreachable!()
          //     self.dynamic_parts
          //         .push(DynamicPart::Slot(n.take(), self.element_index));
          // } else {
          //     self.dynamic_parts
          //         .push(DynamicPart::Slot(n.take(), self.element_index));
          // }

          unreachable!("should be handled by WrapDynamicPart");
        }

        self.element_index += 1;
      }

      if self.parent_element.is_none() {
        let elements = Expr::Array(ArrayLit {
          span: DUMMY_SP,
          elems: (0..self.element_ids.len())
            .step_by(1)
            .map(|e| e as i32)
            .map(|e| {
              Some(ExprOrSpread {
                spread: None,
                expr: Box::new(Expr::Ident(self.element_ids[&e].clone())),
              })
            })
            .collect(),
        });

        self.static_stmts.push(RefCell::new(quote!(
          r#"return $elements;"# as Stmt,
          elements: Expr = elements,
        )));

        self.snapshot_creator = Some(Function {
          ctxt: SyntaxContext::default(),
          params: match Lazy::<Ident>::get(&self.si_id) {
            Some(_) => vec![Param {
              span: DUMMY_SP,
              decorators: vec![],
              pat: Pat::Ident(BindingIdent {
                id: self.si_id.take(),
                type_ann: None,
              }),
            }],
            None => vec![],
          },
          decorators: vec![],
          span: DUMMY_SP,
          body: Some(BlockStmt {
            ctxt: SyntaxContext::default(),
            span: DUMMY_SP,
            stmts: self
              .static_stmts
              .take()
              .into_iter()
              .map(|mut stmt| stmt.get_mut().take())
              .collect(),
          }),
          is_generator: false,
          is_async: false,
          type_params: None,
          return_type: None,
        });
      };
    } else {
      n.visit_mut_children_with(self.dynamic_part_visitor);

      if self.parent_element.is_some() {
        self.dynamic_parts.push(DynamicPart::Children(
          Expr::JSXElement(Box::new(n.take())),
          self.element_index,
        ));

        // self.element_index += 1;
        *n = WRAPPER_NODE.clone();
        n.visit_mut_with(self);
      }
    }
  }

  fn visit_mut_jsx_text(&mut self, n: &mut JSXText) {
    let t = jsx_text_to_str(&n.value);

    if !t.is_empty() {
      let el = private_ident!("el");
      self.element_ids.insert(self.element_index, el.clone());

      self.static_stmts.push(RefCell::new(quote!(
          r#"const $element = __CreateRawText($t)"# as Stmt,
          element = el.clone(),
          t: Expr = t.into(),
      )));

      if let Some(parent_el) = &self.parent_element {
        self.static_stmts.push(RefCell::new(quote!(
            r#"__AppendElement($parent, $child)"# as Stmt,
            parent: Ident = parent_el.clone(),
            child: Ident = el.clone(),
        )));
      };

      self.element_index += 1;
    }
  }
}

/// @internal
#[derive(Deserialize, PartialEq, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct JSXTransformerConfig {
  /// @internal
  pub preserve_jsx: bool,
  /// @internal
  pub runtime_pkg: String,
  /// @internal
  pub jsx_import_source: Option<String>,
  /// @internal
  pub filename: String,
  /// @internal
  pub target: TransformTarget,
  /// @internal
  pub is_dynamic_component: Option<bool>,
  /// @internal
  pub experimental_enable_element_template: bool,
}

impl Default for JSXTransformerConfig {
  fn default() -> Self {
    Self {
      preserve_jsx: false,
      runtime_pkg: "@lynx-js/react".into(),
      jsx_import_source: Some("@lynx-js/react".into()),
      filename: Default::default(),
      target: TransformTarget::LEPUS,
      is_dynamic_component: Some(false),
      experimental_enable_element_template: false,
    }
  }
}

pub struct JSXTransformer<C>
where
  C: Comments + Clone,
{
  // react_transformer: Box<dyn Fold>,
  cfg: JSXTransformerConfig,
  filename_hash: String,
  pub content_hash: String,
  runtime_id: Lazy<Expr>,
  runtime_components_ident: Ident,
  runtime_components_module_item: Option<ModuleItem>,
  css_id_value: Option<Expr>,
  pub element_templates: Option<Rc<RefCell<Vec<ElementTemplateAsset>>>>,
  snapshot_counter: u32,
  current_snapshot_defs: Vec<ModuleItem>,
  current_snapshot_id: Option<Ident>,
  comments: Option<C>,
  slot_ident: Ident,
  used_slot: bool,
}

impl<C> JSXTransformer<C>
where
  C: Comments + Clone,
{
  pub fn with_content_hash(mut self, content_hash: String) -> Self {
    self.content_hash = content_hash;
    self
  }

  pub fn new(
    cfg: JSXTransformerConfig,
    comments: Option<C>,
    mode: TransformMode,
    element_templates: Option<Rc<RefCell<Vec<ElementTemplateAsset>>>>,
  ) -> Self {
    JSXTransformer {
      filename_hash: calc_hash(&cfg.filename.clone()),
      content_hash: "test".into(),
      runtime_id: match mode {
        TransformMode::Development => {
          // We should find a way to use `cfg.runtime_pkg`
          Lazy::new(|| quote!("require('@lynx-js/react/internal')" as Expr))
        }
        TransformMode::Production | TransformMode::Test => {
          Lazy::new(|| Expr::Ident(private_ident!("ReactLynx")))
        }
      },
      runtime_components_ident: private_ident!("ReactLynxRuntimeComponents"),
      runtime_components_module_item: None,
      element_templates,
      cfg,
      css_id_value: None,
      snapshot_counter: 0,
      current_snapshot_defs: vec![],
      current_snapshot_id: None,
      comments,
      slot_ident: private_ident!("Slot"),
      used_slot: false,
    }
  }

  fn parse_directives(&mut self, span: Span) {
    self.comments.with_leading(span.lo, |comments| {
      for cmt in comments {
        if cmt.kind != CommentKind::Block {
          continue;
        }
        for line in cmt.text.lines() {
          let mut line = line.trim();
          if line.starts_with('*') {
            line = line[1..].trim();
          }

          if !line.starts_with("@jsx") {
            continue;
          }

          let mut words = line.split_whitespace();
          loop {
            let pragma = words.next();
            if pragma.is_none() {
              break;
            }
            let val = words.next();
            if let Some("@jsxCSSId") = pragma {
              if let Some(css_id) = val {
                self.css_id_value = Some(Expr::Lit(Lit::Num(
                  css_id
                    .parse::<f64>()
                    .expect("should have numeric cssId")
                    .into(),
                )));
              }
            }
          }
        }
      }
    });
  }

  fn element_template_to_json(&self, expr: &Expr) -> serde_json::Value {
    match expr {
      Expr::Lit(lit) => match lit {
        Lit::Str(s) => serde_json::Value::String(s.value.as_str().unwrap_or("").to_string()),
        Lit::Num(n) => serde_json::Value::Number(serde_json::Number::from_f64(n.value).unwrap()),
        Lit::Bool(b) => serde_json::Value::Bool(b.value),
        Lit::Null(_) => serde_json::Value::Null,
        _ => serde_json::Value::Null,
      },
      Expr::Array(arr) => {
        let elems: Vec<serde_json::Value> = arr
          .elems
          .iter()
          .map(|elem| {
            if let Some(elem) = elem {
              self.element_template_to_json(&elem.expr)
            } else {
              serde_json::Value::Null
            }
          })
          .collect();
        serde_json::Value::Array(elems)
      }
      Expr::Object(obj) => {
        let mut map = serde_json::Map::new();
        for prop in &obj.props {
          if let PropOrSpread::Prop(prop) = prop {
            if let Prop::KeyValue(kv) = &**prop {
              let key;
              if let PropName::Ident(ident) = &kv.key {
                key = ident.sym.as_str().to_string();
              } else if let PropName::Str(s) = &kv.key {
                key = s.value.as_str().unwrap_or("").to_string();
              } else {
                continue;
              };
              let value = self.element_template_to_json(&kv.value);
              map.insert(key, value);
            }
          }
        }
        serde_json::Value::Object(map)
      }
      _ => serde_json::Value::Null,
    }
  }

  fn element_template_from_jsx_children(
    &self,
    children: &[JSXElementChild],
    slot_index: &mut i32,
  ) -> Vec<ExprOrSpread> {
    let mut out: Vec<ExprOrSpread> = vec![];

    for child in children {
      match child {
        JSXElementChild::JSXText(txt) => {
          let s = jsx_text_to_str(&txt.value);
          let tag_value = s.clone();
          if s.trim().is_empty() {
            continue;
          }

          let expr = Expr::Object(ObjectLit {
            span: DUMMY_SP,
            props: vec![
              PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(IdentName::new("tag".into(), DUMMY_SP)),
                value: Box::new(Expr::Lit(Lit::Str(Str {
                  span: DUMMY_SP,
                  raw: None,
                  value: "text".into(),
                }))),
              }))),
              PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(IdentName::new("attributes".into(), DUMMY_SP)),
                value: Box::new(Expr::Object(ObjectLit {
                  span: DUMMY_SP,
                  props: vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                    key: PropName::Ident(IdentName::new("text".into(), DUMMY_SP)),
                    value: Box::new(Expr::Lit(Lit::Str(Str {
                      span: DUMMY_SP,
                      raw: None,
                      value: tag_value.into(),
                    }))),
                  })))],
                })),
              }))),
            ],
          });
          out.push(ExprOrSpread {
            spread: None,
            expr: Box::new(expr),
          });
        }
        JSXElementChild::JSXElement(el) => {
          out.push(ExprOrSpread {
            spread: None,
            expr: Box::new(self.element_template_from_jsx_element(el, slot_index)),
          });
        }
        JSXElementChild::JSXFragment(frag) => {
          out.extend(self.element_template_from_jsx_children(&frag.children, slot_index));
        }
        JSXElementChild::JSXExprContainer(JSXExprContainer {
          expr: JSXExpr::Expr(_),
          ..
        }) => {
          let idx = *slot_index;
          *slot_index += 1;
          let expr = Expr::Object(ObjectLit {
            span: DUMMY_SP,
            props: vec![
              PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(IdentName::new("tag".into(), DUMMY_SP)),
                value: Box::new(Expr::Lit(Lit::Str("slot".into()))),
              }))),
              PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(IdentName::new("attributes".into(), DUMMY_SP)),
                value: Box::new(Expr::Object(ObjectLit {
                  span: DUMMY_SP,
                  props: vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                    key: PropName::Str(Str {
                      span: DUMMY_SP,
                      raw: Some("\"part-id\"".into()),
                      value: "part-id".into(),
                    }),
                    value: Box::new(Expr::Lit(Lit::Num(Number {
                      span: DUMMY_SP,
                      value: idx as f64,
                      raw: None,
                    }))),
                  })))],
                })),
              }))),
            ],
          });
          out.push(ExprOrSpread {
            spread: None,
            expr: Box::new(expr),
          });
        }
        JSXElementChild::JSXExprContainer(JSXExprContainer {
          expr: JSXExpr::JSXEmptyExpr(_),
          ..
        }) => {}
        JSXElementChild::JSXSpreadChild(_) => {
          let idx = *slot_index;
          *slot_index += 1;
          let expr = Expr::Object(ObjectLit {
            span: DUMMY_SP,
            props: vec![
              PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(IdentName::new("tag".into(), DUMMY_SP)),
                value: Box::new(Expr::Lit(Lit::Str("slot".into()))),
              }))),
              PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Ident(IdentName::new("attributes".into(), DUMMY_SP)),
                value: Box::new(Expr::Object(ObjectLit {
                  span: DUMMY_SP,
                  props: vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                    key: PropName::Str(Str {
                      span: DUMMY_SP,
                      raw: Some("\"part-id\"".into()),
                      value: "part-id".into(),
                    }),
                    value: Box::new(Expr::Lit(Lit::Num(Number {
                      span: DUMMY_SP,
                      value: idx as f64,
                      raw: None,
                    }))),
                  })))],
                })),
              }))),
            ],
          });
          out.push(ExprOrSpread {
            spread: None,
            expr: Box::new(expr),
          });
        }
      }
    }

    out
  }

  fn element_template_from_jsx_element(&self, n: &JSXElement, slot_index: &mut i32) -> Expr {
    let tag_expr = jsx_name(n.opening.name.clone());
    let tag_value = match *tag_expr {
      Expr::Lit(Lit::Str(s)) => s.value,
      _ => "".into(),
    };

    let mut attributes_props: Vec<PropOrSpread> = vec![];
    let mut part_id: Option<i32> = None;

    for attr in &n.opening.attrs {
      let JSXAttrOrSpread::JSXAttr(attr) = attr else {
        continue;
      };

      let JSXAttrName::Ident(name) = &attr.name else {
        continue;
      };

      let Some(value) = &attr.value else {
        continue;
      };

      if name.sym == "__lynx_part_id" {
        if let JSXAttrValue::Str(s) = value {
          if let Ok(pid) = s.value.to_string_lossy().parse::<i32>() {
            part_id = Some(pid);
          }
        }
        continue;
      }

      let lit_val = match value {
        JSXAttrValue::Str(s) => Some(Expr::Lit(Lit::Str(s.clone()))),
        JSXAttrValue::JSXExprContainer(JSXExprContainer {
          expr: JSXExpr::Expr(expr),
          ..
        }) => match &**expr {
          Expr::Lit(Lit::Str(s)) => Some(Expr::Lit(Lit::Str(s.clone()))),
          Expr::Lit(Lit::Num(n)) => Some(Expr::Lit(Lit::Num(n.clone()))),
          Expr::Lit(Lit::Bool(b)) => Some(Expr::Lit(Lit::Bool(*b))),
          // TODO: Support complex static values (Object, Array, Null, Template Literal without expressions)
          // See ElementTemplate/Todo-StaticAttributesOpts.md
          _ => None,
        },
        _ => None,
      };

      let Some(lit_val) = lit_val else {
        continue;
      };

      let key_sym = name.sym.as_ref();
      let key = if key_sym == "className" {
        "class"
      } else {
        key_sym
      };

      let prop_name = if key.contains('-') {
        PropName::Str(Str {
          span: DUMMY_SP,
          raw: Some(format!("\"{}\"", key).into()),
          value: key.into(),
        })
      } else {
        PropName::Ident(IdentName::new(key.into(), DUMMY_SP))
      };

      attributes_props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
        key: prop_name,
        value: Box::new(lit_val),
      }))));
    }

    if let Some(pid) = part_id {
      attributes_props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
        key: PropName::Str(Str {
          span: DUMMY_SP,
          raw: Some("\"part-id\"".into()),
          value: "part-id".into(),
        }),
        value: Box::new(Expr::Lit(Lit::Num(Number {
          span: DUMMY_SP,
          value: pid as f64,
          raw: None,
        }))),
      }))));
    }

    let final_tag = if tag_value == "wrapper" {
      "slot".into()
    } else {
      tag_value
    };

    // Optimization for text tags:
    // If <text> (or similar) has only one static text child, use `text` attribute instead of checking children.
    let is_text_tag = final_tag == "text"
      || final_tag == "raw-text"
      || final_tag == "inline-text"
      || final_tag == "x-text"
      || final_tag == "x-inline-text";
    let mut text_child_optimized = false;

    let mut props: Vec<PropOrSpread> =
      vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
        key: PropName::Ident(IdentName::new("tag".into(), DUMMY_SP)),
        value: Box::new(Expr::Lit(Lit::Str(Str {
          span: DUMMY_SP,
          raw: None,
          value: final_tag,
        }))),
      })))];

    if is_text_tag {
      let valid_children: Vec<&JSXElementChild> = n
        .children
        .iter()
        .filter(|c| match c {
          JSXElementChild::JSXText(t) => !jsx_text_to_str(&t.value).trim().is_empty(),
          _ => true,
        })
        .collect();

      if valid_children.len() == 1 {
        if let JSXElementChild::JSXText(txt) = valid_children[0] {
          let s = jsx_text_to_str(&txt.value);
          attributes_props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(IdentName::new("text".into(), DUMMY_SP)),
            value: Box::new(Expr::Lit(Lit::Str(Str {
              span: DUMMY_SP,
              raw: None,
              value: s.into(),
            }))),
          }))));
          text_child_optimized = true;
        }
      }
    }

    if !attributes_props.is_empty() {
      props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
        key: PropName::Ident(IdentName::new("attributes".into(), DUMMY_SP)),
        value: Box::new(Expr::Object(ObjectLit {
          span: DUMMY_SP,
          props: attributes_props,
        })),
      }))));
    }

    if !text_child_optimized {
      let children_exprs = self.element_template_from_jsx_children(&n.children, slot_index);
      if !children_exprs.is_empty() {
        props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
          key: PropName::Ident(IdentName::new("children".into(), DUMMY_SP)),
          value: Box::new(Expr::Array(ArrayLit {
            span: DUMMY_SP,
            elems: children_exprs.into_iter().map(Some).collect(),
          })),
        }))));
      }
    }

    Expr::Object(ObjectLit {
      span: DUMMY_SP,
      props,
    })
  }
}

impl<C> VisitMut for JSXTransformer<C>
where
  C: Comments + Clone,
{
  fn visit_mut_jsx_element(&mut self, node: &mut JSXElement) {
    match *jsx_name(node.opening.name.clone()) {
      Expr::Lit(lit) => {
        if let Lit::Str(s) = &lit {
          let tag = s.value.to_string_lossy();
          let tag_str = tag.as_ref();
          if tag_str == "wrapper" {
            return node.visit_mut_children_with(self);
          }
          if tag_str == "page" {
            if self.runtime_components_module_item.is_none() {
              self.runtime_components_module_item = Some(quote!(
                r#"import * as $runtime_components_ident from '@lynx-js/react/runtime-components';"#
                  as ModuleItem,
                runtime_components_ident = self.runtime_components_ident.clone(),
              ));
            }

            if let JSXElementName::Ident(_ident) = &mut node.opening.name {
              node.opening.name = JSXElementName::JSXMemberExpr(JSXMemberExpr {
                obj: JSXObject::Ident(self.runtime_components_ident.clone()),
                prop: private_ident!("Page").into(),
                span: node.opening.span,
              });

              if let Some(JSXClosingElement { name, .. }) = &mut node.closing {
                if let JSXElementName::Ident(ident) = name {
                  *name = JSXElementName::JSXMemberExpr(JSXMemberExpr {
                    obj: JSXObject::Ident(self.runtime_components_ident.clone()),
                    prop: private_ident!("Page").into(),
                    span: ident.span(),
                  });
                }
              }
            }
            return node.visit_mut_children_with(self);
          }

          if tag_str == "component" {
            HANDLER.with(|handler| {
              handler
                .struct_span_err(node.opening.name.span(), "<component /> is not supported")
                .emit()
            });
          }
        }
      }
      _ => {
        return node.visit_mut_children_with(self);
      }
    }

    self.snapshot_counter += 1;

    let use_element_template = self.cfg.experimental_enable_element_template;
    let snapshot_uid_prefix = if use_element_template {
      "_et"
    } else {
      "__snapshot"
    };
    let snapshot_uid = format!(
      "{}_{}_{}_{}",
      snapshot_uid_prefix, self.filename_hash, self.content_hash, self.snapshot_counter
    );
    let snapshot_id = Ident::new(
      // format!("__snapshot_{}", snapshot_uid).into(),
      snapshot_uid.clone().into(),
      DUMMY_SP,
      SyntaxContext::default().apply_mark(Mark::fresh(Mark::root())),
    );

    let mut wrap_dynamic_part = WrapperMarker {
      current_is_children_full_dynamic: false,
      dynamic_part_count: 0,
      enable_element_template: self.cfg.experimental_enable_element_template,
    };
    node.visit_mut_with(&mut wrap_dynamic_part);

    let target = self.cfg.target;
    let runtime_id = self.runtime_id.clone();
    let experimental_enable_element_template = self.cfg.experimental_enable_element_template;
    let (key, snapshot_creator_func, (dynamic_part_attr, dynamic_part_children)): (
      Option<JSXAttrValue>,
      Option<Function>,
      (Vec<_>, Vec<_>),
    ) = {
      let mut dynamic_part_extractor = DynamicPartExtractor::new(
        self.runtime_id.clone(),
        wrap_dynamic_part.dynamic_part_count,
        self,
        experimental_enable_element_template,
      );

      node.visit_mut_with(&mut dynamic_part_extractor);

      (
        dynamic_part_extractor.key,
        dynamic_part_extractor.snapshot_creator,
        dynamic_part_extractor.dynamic_parts.into_iter().partition(
          |dynamic_part| match dynamic_part {
            DynamicPart::Attr(_, _, _) | DynamicPart::Spread(_, _) => true,
            DynamicPart::Slot(_, _)
            | DynamicPart::Children(_, _)
            | DynamicPart::ListChildren(_, _) => false,
          },
        ),
      )
    };

    let mut snapshot_children: Vec<JSXElementChild> = vec![];
    let mut snapshot_dynamic_part_def: Vec<Option<ExprOrSpread>> = vec![];
    let mut snapshot_refs_and_spread_index: Vec<Option<ExprOrSpread>> = vec![];
    let mut snapshot_slot_def: Vec<Option<ExprOrSpread>> = vec![];
    let mut snapshot_values: Vec<Option<ExprOrSpread>> = vec![];
    let mut snapshot_attrs: Vec<JSXAttrOrSpread> = vec![];
    let mut snapshot_values_has_attr = false;

    // Use a BTreeMap to group attributes by part-id (sorted by index)
    let mut attrs_accumulator: BTreeMap<i32, Vec<PropOrSpread>> = BTreeMap::new();

    if let Some(key) = key {
      snapshot_attrs.push(JSXAttrOrSpread::JSXAttr(JSXAttr {
        span: DUMMY_SP,
        name: JSXAttrName::Ident(IdentName::new("key".into(), DUMMY_SP)),
        value: Some(key),
      }));
    }

    dynamic_part_attr
      .into_iter()
      .enumerate()
      .map(|(index, dynamic_part)| {
        (
          JSXAttrName::Ident(IdentName::new(format!("__{index}").into(), DUMMY_SP)),
          JSXAttrName::Ident(IdentName::new(format!("_c{index}").into(), DUMMY_SP)),
          JSXElementName::Ident(Ident::new(
            format!("s{index}").into(),
            DUMMY_SP,
            SyntaxContext::default(),
          )),
          dynamic_part,
        )
      })
      .map(|(name, child_name, ref jsx_name, dynamic_part)| {
        (
          name,
          child_name,
          JSXOpeningElement {
            name: jsx_name.clone(),
            span: DUMMY_SP,
            attrs: vec![],
            self_closing: false,
            type_args: None,
          },
          JSXClosingElement {
            name: jsx_name.clone(),
            span: DUMMY_SP,
          },
          dynamic_part,
        )
      })
      .for_each(
        |(_name, _child_name, _jsx_opening, _jsx_closing, dynamic_part)| {
          match &dynamic_part {
            DynamicPart::Attr(_, _, _) | DynamicPart::Spread(_, _) => {
              if let DynamicPart::Attr(_, _, AttrName::Ref) | DynamicPart::Spread(_, _) =
                dynamic_part
              {
                snapshot_refs_and_spread_index.push(Some(
                  Expr::Lit(Lit::Num(snapshot_dynamic_part_def.len().into())).into(),
                ));
              }
              snapshot_dynamic_part_def.push(Some(ExprOrSpread {
                spread: None,
                expr: Box::new(dynamic_part.to_updater(
                  runtime_id.clone(),
                  target,
                  snapshot_dynamic_part_def.len() as i32,
                )),
              }));
            }
            DynamicPart::Slot(_, _) => {}
            DynamicPart::Children(_, _) => {}
            DynamicPart::ListChildren(_, _) => {}
          }

          if experimental_enable_element_template {
            match dynamic_part {
              DynamicPart::Attr(value, element_index, attr_name) => {
                let prop_key = match attr_name {
                  AttrName::Attr(ref name) | AttrName::Dataset(ref name) => PropName::Str(Str {
                    span: DUMMY_SP,
                    value: name.as_str().into(),
                    raw: None,
                  }),
                  AttrName::Event(ref name, _) => PropName::Str(Str {
                    span: DUMMY_SP,
                    value: name.as_str().into(),
                    raw: None,
                  }),
                  AttrName::Ref => PropName::Ident(IdentName::new("ref".into(), DUMMY_SP)),
                  AttrName::Class => PropName::Ident(IdentName::new("class".into(), DUMMY_SP)),
                  AttrName::Style => PropName::Ident(IdentName::new("style".into(), DUMMY_SP)),
                  AttrName::ID => PropName::Ident(IdentName::new("id".into(), DUMMY_SP)),
                  _ => PropName::Str(Str {
                    span: DUMMY_SP,
                    // generic fallback, though other types might need specific handling
                    value: "".into(),
                    raw: None,
                  }),
                };

                let prop_value = if let AttrName::Event(_, _) = attr_name {
                  if target == TransformTarget::LEPUS {
                    quote!("1" as Expr)
                  } else {
                    value
                  }
                } else if let AttrName::Ref = attr_name {
                  if target == TransformTarget::LEPUS {
                    quote!("1" as Expr)
                  } else {
                    quote!(
                      "$runtime_id.transformRef($value)" as Expr,
                      runtime_id: Expr = runtime_id.clone(),
                      value: Expr = value,
                    )
                  }
                } else {
                  value
                };

                // Ensure we handle keys correctly for AttrName variants that map to string keys
                let prop_key = match prop_key {
                  PropName::Ident(ident) => PropName::Ident(ident),
                  PropName::Str(str_val) => PropName::Str(str_val),
                  _ => PropName::Ident(IdentName::new("unknown".into(), DUMMY_SP)),
                };

                attrs_accumulator
                  .entry(element_index)
                  .or_insert_with(Vec::new)
                  .push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                    key: prop_key,
                    value: Box::new(prop_value),
                  }))));
                snapshot_values_has_attr = true;
              }
              DynamicPart::Spread(value, element_index) => {
                attrs_accumulator
                  .entry(element_index)
                  .or_insert_with(Vec::new)
                  .push(PropOrSpread::Spread(SpreadElement {
                    dot3_token: DUMMY_SP,
                    expr: Box::new(value),
                  }));
                snapshot_values_has_attr = true;
              }
              _ => {}
            }
          } else {
            match dynamic_part {
              DynamicPart::Attr(value, _, attr_name) => {
                snapshot_values.push(Some(ExprOrSpread {
                  spread: None,
                  expr: Box::new(if let AttrName::Event(_, _) = attr_name {
                    if target == TransformTarget::LEPUS {
                      quote!("1" as Expr)
                    } else {
                      value
                    }
                  } else if let AttrName::Ref = attr_name {
                    if target == TransformTarget::LEPUS {
                      quote!("1" as Expr)
                    } else {
                      quote!(
                        "$runtime_id.transformRef($value)" as Expr,
                        runtime_id: Expr = runtime_id.clone(),
                        value: Expr = value,
                      )
                    }
                  } else {
                    value
                  }),
                }));
                snapshot_values_has_attr = true;
              }
              DynamicPart::Spread(value, _) => {
                snapshot_values.push(Some(ExprOrSpread {
                  spread: None,
                  expr: Box::new(value),
                }));
                snapshot_values_has_attr = true;
              }
              DynamicPart::ListChildren(_, _) => {}
              DynamicPart::Children(_, _) => {}
              DynamicPart::Slot(_, _) => {}
            }
          }
        },
      );

    let slot_expr = match (dynamic_part_children.len(), dynamic_part_children.first()) {
      (0, _) => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
      (1, Some(DynamicPart::Children(expr, 0))) => {
        let expr = expr.clone();
        let child = match expr {
          Expr::JSXElement(jsx) => JSXElementChild::JSXElement(jsx),
          _ => JSXElementChild::JSXExprContainer(JSXExprContainer {
            span: DUMMY_SP,
            expr: JSXExpr::Expr(Box::new(expr)),
          }),
        };
        snapshot_children.push(if use_element_template {
          self.used_slot = true;
          wrap_in_slot(&self.slot_ident, 0, vec![child])
        } else {
          child
        });

        quote!(
          "$runtime_id.__DynamicPartChildren_0" as Expr,
          runtime_id: Expr = runtime_id.clone(),
        )
      }
      _ => {
        dynamic_part_children.into_iter().for_each(|dynamic_part| {
          match dynamic_part {
            DynamicPart::Attr(_, _, _) => {}
            DynamicPart::Spread(_, _) => {}
            DynamicPart::ListChildren(expr, element_index) => {
              // snapshot_values.push(None);
              let child = match expr {
                Expr::JSXElement(jsx) => JSXElementChild::JSXElement(jsx),
                _ => JSXElementChild::JSXExprContainer(JSXExprContainer {
                  span: DUMMY_SP,
                  expr: JSXExpr::Expr(Box::new(expr)),
                }),
              };
              snapshot_children.push(if use_element_template {
                self.used_slot = true;
                wrap_in_slot(&self.slot_ident, element_index, vec![child])
              } else {
                child
              });
              snapshot_slot_def.push(Some(ExprOrSpread {
                spread: None,
                expr: Box::new(quote!(
                  "[$runtime_id.__DynamicPartListChildren, $element_index]" as Expr,
                  runtime_id: Expr = runtime_id.clone(),
                  element_index: Expr = i32_to_expr(&element_index),
                )),
              }));
            }
            DynamicPart::Children(expr, element_index) => {
              // snapshot_values.push(None);
              let child = match expr {
                Expr::JSXElement(jsx) => JSXElementChild::JSXElement(jsx),
                _ => JSXElementChild::JSXExprContainer(JSXExprContainer {
                  span: DUMMY_SP,
                  expr: JSXExpr::Expr(Box::new(expr)),
                }),
              };
              snapshot_children.push(if use_element_template {
                self.used_slot = true;
                wrap_in_slot(&self.slot_ident, element_index, vec![child])
              } else {
                child
              });
              snapshot_slot_def.push(Some(ExprOrSpread {
                spread: None,
                expr: Box::new(quote!(
                  "[$runtime_id.__DynamicPartChildren, $element_index]" as Expr,
                  runtime_id: Expr = runtime_id.clone(),
                  element_index: Expr = i32_to_expr(&element_index),
                )),
              }));
            }
            DynamicPart::Slot(children, element_index) => {
              // snapshot_values.push(None);
              if use_element_template {
                self.used_slot = true;
                snapshot_children.push(wrap_in_slot(&self.slot_ident, element_index, children));
              } else {
                snapshot_children.extend(children);
              }
              snapshot_slot_def.push(Some(ExprOrSpread {
                spread: None,
                expr: Box::new(quote!(
                  "[$runtime_id.__DynamicPartSlot, $element_index]" as Expr,
                  runtime_id: Expr = runtime_id.clone(),
                  element_index: Expr = i32_to_expr(&element_index),
                )),
              }));
            }
          }
        });

        Expr::Array(ArrayLit {
          span: DUMMY_SP,
          elems: snapshot_slot_def,
        })
      }
    };

    let snapshot_creator = if target == TransformTarget::JS {
      Expr::Lit(Lit::Null(Null { span: DUMMY_SP }))
    } else {
      Expr::Fn(FnExpr {
        ident: None,
        function: Box::new(snapshot_creator_func.unwrap()),
      })
    };

    let snapshot_create_call = quote!(
        r#"$runtime_id.snapshotCreatorMap[$snapshot_id] = ($snapshot_id) => $runtime_id.createSnapshot(
             $snapshot_id,
             $snapshot_creator,
             $snapshot_dynamic_parts_def,
             $slot,
             $css_id,
             globDynamicComponentEntry,
             $snapshot_refs_and_spread_index,
             true
        )"# as Expr,
        runtime_id: Expr = self.runtime_id.clone(),
        snapshot_id = snapshot_id.clone(),
        snapshot_creator: Expr = snapshot_creator,
        snapshot_dynamic_parts_def: Expr = match (target, snapshot_dynamic_part_def.len()) {
          (TransformTarget::JS, _) | (_, 0) => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
          _ => Expr::Array(ArrayLit { span: DUMMY_SP, elems: snapshot_dynamic_part_def }),
        },
        slot: Expr = slot_expr,
        css_id: Expr = match &self.css_id_value {
          Some(css_id_expr) => css_id_expr.clone(),
          // We use `undefined` here since runtime will skip `__SetCSSId` when `cssId === undefined && entryName === undefined`
          None => Expr::Ident("undefined".into()),
        },
        snapshot_refs_and_spread_index: Expr = match snapshot_refs_and_spread_index.len() {
          0 => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
          _ => Expr::Array(ArrayLit { span: DUMMY_SP, elems: snapshot_refs_and_spread_index }),
        },
        // has_multi_children: Expr = Expr::Lit(Lit::Num(Number { span: DUMMY_SP, value: wrap_dynamic_part.dynamic_part_count as f64, raw: None })),
    );

    let mut entry_snapshot_uid = quote!("$snapshot_uid" as Expr, snapshot_uid: Expr = Expr::Lit(Lit::Str(snapshot_uid.clone().into())));
    if matches!(self.cfg.is_dynamic_component, Some(true)) {
      entry_snapshot_uid = quote!("`${globDynamicComponentEntry}:${$snapshot_uid}`" as Expr, snapshot_uid: Expr = Expr::Lit(Lit::Str(snapshot_uid.clone().into())));
    }

    let entry_snapshot_uid_def = ModuleItem::Stmt(quote!(
        r#"const $snapshot_id = $entry_snapshot_uid"#
            as Stmt,
        snapshot_id = snapshot_id.clone(),
        entry_snapshot_uid: Expr = entry_snapshot_uid.clone(),
    ));
    self.current_snapshot_id = Some(snapshot_id.clone());
    self.current_snapshot_defs.push(entry_snapshot_uid_def);

    if use_element_template {
      let mut slot_index: i32 = 0;
      let template_expr = self.element_template_from_jsx_element(node, &mut slot_index);
      let suffix = snapshot_uid
        .strip_prefix("_et_")
        .unwrap_or(snapshot_uid.as_str());

      if let Some(element_templates) = &self.element_templates {
        let compiled_template = self.element_template_to_json(&template_expr);
        element_templates.borrow_mut().push(ElementTemplateAsset {
          template_id: format!("_et_{suffix}"),
          compiled_template,
          source_file: self.cfg.filename.clone(),
        });
      }
    } else {
      let snapshot_def = ModuleItem::Stmt(quote!(
          r#"$snapshot_create_call"#
              as Stmt,
          snapshot_create_call: Expr = snapshot_create_call,
      ));
      self.current_snapshot_defs.push(snapshot_def);
    }

    *node = JSXElement {
      span: node.span(),
      opening: JSXOpeningElement {
        name: JSXElementName::Ident(snapshot_id.clone()),
        span: node.span,
        attrs: {
          if snapshot_values_has_attr {
            if self.cfg.experimental_enable_element_template {
              let mut props = vec![];
              for (element_index, attrs) in attrs_accumulator {
                // Determine whether the key requires quotes.
                // Numbers can be used directly as keys in object literals, behaving like strings.
                let key = PropName::Num(Number {
                  span: DUMMY_SP,
                  value: element_index as f64,
                  raw: None, // Let the printer handle formatting if needed, or provide string if strictly required
                });

                props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                  key,
                  value: Box::new(Expr::Object(ObjectLit {
                    span: DUMMY_SP,
                    props: attrs,
                  })),
                }))));
              }

              snapshot_attrs.push(JSXAttrOrSpread::JSXAttr(JSXAttr {
                span: DUMMY_SP,
                name: JSXAttrName::Ident(IdentName::new("attrs".into(), DUMMY_SP)),
                value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                  span: DUMMY_SP,
                  expr: JSXExpr::Expr(Box::new(Expr::Object(ObjectLit {
                    span: DUMMY_SP,
                    props,
                  }))),
                })),
              }));
            } else {
              snapshot_attrs.push(JSXAttrOrSpread::JSXAttr(JSXAttr {
                span: DUMMY_SP,
                name: JSXAttrName::Ident(IdentName::new("values".into(), DUMMY_SP)),
                value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                  span: DUMMY_SP,
                  expr: JSXExpr::Expr(Box::new(Expr::Array(ArrayLit {
                    span: DUMMY_SP,
                    elems: snapshot_values,
                  }))),
                })),
              }))
            }
          };
          snapshot_attrs
        },
        self_closing: wrap_dynamic_part.dynamic_part_count == 0,
        type_args: None,
      },
      children: snapshot_children,
      closing: if wrap_dynamic_part.dynamic_part_count == 0 {
        None
      } else {
        Some(JSXClosingElement {
          name: JSXElementName::Ident(snapshot_id.clone()),
          span: DUMMY_SP,
        })
      },
    };
  }

  fn visit_mut_module_items(&mut self, n: &mut Vec<ModuleItem>) {
    let mut new_items: Vec<ModuleItem> = vec![];
    for item in n.iter_mut() {
      item.visit_mut_with(self);
      new_items.extend(self.current_snapshot_defs.take());
      new_items.push(item.take());
    }

    if let Some(module_item) = &self.runtime_components_module_item {
      new_items.insert(0, module_item.clone());
    }

    *n = new_items;
  }

  fn visit_mut_module(&mut self, n: &mut Module) {
    self.parse_directives(n.span);
    for item in &n.body {
      let span = item.span();
      self.parse_directives(span);
    }

    if matches!(self.cfg.is_dynamic_component, Some(true)) && self.css_id_value.is_none() {
      self.css_id_value = Some(Expr::Lit(Lit::Num(0.into())));
    }

    n.visit_mut_children_with(self);
    if let Some(Expr::Ident(runtime_id)) = Lazy::<Expr>::get(&self.runtime_id) {
      prepend_stmt(
        &mut n.body,
        ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
          span: DUMMY_SP,
          specifiers: vec![ImportSpecifier::Namespace(ImportStarAsSpecifier {
            span: DUMMY_SP,
            local: runtime_id.clone(),
          })],
          src: Box::new(Str {
            span: DUMMY_SP,
            raw: None,
            value: self.cfg.runtime_pkg.clone().into(),
          }),
          type_only: Default::default(),
          // asserts: Default::default(),
          with: Default::default(),
          phase: ImportPhase::Evaluation,
        })),
      );
    }

    if self.cfg.experimental_enable_element_template && self.used_slot {
      prepend_stmt(
        &mut n.body,
        ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
          span: DUMMY_SP,
          specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
            span: DUMMY_SP,
            local: self.slot_ident.clone(),
            imported: Some(ModuleExportName::Ident(Ident::new(
              "Slot".into(),
              DUMMY_SP,
              SyntaxContext::default(),
            ))),
            is_type_only: false,
          })],
          src: Box::new(Str {
            span: DUMMY_SP,
            raw: None,
            value: self.cfg.runtime_pkg.clone().into(),
          }),
          type_only: Default::default(),
          with: Default::default(),
          phase: ImportPhase::Evaluation,
        })),
      );
    }
  }
}

// #[plugin_transform]
// pub fn process_transform(program: Program, metadata: TransformPluginProgramMetadata) -> Program {
//     let filename = metadata
//         .get_context(&TransformPluginMetadataContextKind::Filename)
//         .unwrap();

//     program.fold_with(&mut JSXTransformer {
//         // filename: "index.js".into(),
//         filename,
//         snapshot_counter: 0,
//         current_snapshot_defs: vec![],
//     })
// }

#[cfg(test)]
mod tests {
  use swc_core::{
    common::{comments::SingleThreadedComments, Mark},
    ecma::{
      parser::{EsSyntax, Syntax},
      transforms::{base::resolver, react, testing::test},
      visit::visit_mut_pass,
    },
  };

  use crate::JSXTransformer;
  use swc_plugins_shared::{target::TransformTarget, transform_mode::TransformMode};

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let unresolved_mark = Mark::new();
      let top_level_mark = Mark::new();

      (
        resolver(unresolved_mark, top_level_mark, true),
        visit_mut_pass(JSXTransformer::new(
          super::JSXTransformerConfig {
            preserve_jsx: true,
            ..Default::default()
          },
          Some(t.comments.clone()),
          TransformMode::Test,
          None,
        )),
      )
    },
    basic_full_static,
    // Input codes
    r#"
    <view>
      <text>!!!</text>
      <frame/>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let unresolved_mark = Mark::new();
      let top_level_mark = Mark::new();

      (
        resolver(unresolved_mark, top_level_mark, true),
        visit_mut_pass(JSXTransformer::new(
          super::JSXTransformerConfig {
            preserve_jsx: true,
            ..Default::default()
          },
          Some(t.comments.clone()),
          TransformMode::Test,
          None,
        )),
      )
    },
    full_static_children_self_close,
    // Input codes
    r#"
    <view className="parent">
			<view className="child"/>
			<view className="child"/>
		</view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let unresolved_mark = Mark::new();
      let top_level_mark = Mark::new();

      (
        resolver(unresolved_mark, top_level_mark, true),
        visit_mut_pass(JSXTransformer::new(
          super::JSXTransformerConfig {
            preserve_jsx: true,
            ..Default::default()
          },
          Some(t.comments.clone()),
          TransformMode::Test,
          None,
        )),
      )
    },
    full_static_children_new_line,
    // Input codes
    r#"
    <view className="parent">
			<view className="child">
      </view>
			<view className="child">
      </view>
		</view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let unresolved_mark = Mark::new();
      let top_level_mark = Mark::new();

      (
        resolver(unresolved_mark, top_level_mark, true),
        visit_mut_pass(JSXTransformer::new(
          super::JSXTransformerConfig {
            preserve_jsx: true,
            ..Default::default()
          },
          Some(t.comments.clone()),
          TransformMode::Test,
          None,
        )),
      )
    },
    full_static_children_comments,
    // Input codes
    r#"
    <view className="parent">
			<view className="child">
        {/** foo */}
      </view>
			<view className="child">
        {/** bar */}
      </view>
		</view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let unresolved_mark = Mark::new();
      let top_level_mark = Mark::new();

      (
        resolver(unresolved_mark, top_level_mark, true),
        visit_mut_pass(JSXTransformer::new(
          super::JSXTransformerConfig {
            preserve_jsx: true,
            ..Default::default()
          },
          Some(t.comments.clone()),
          TransformMode::Test,
          None,
        )),
      )
    },
    full_static_children_map_jsx,
    // Input codes
    r#"
    <view className="parent">
			<view className="child">{[].map(() => null)}</view>
			<view className="child">{[].map(() => null)}</view>
		</view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let unresolved_mark = Mark::new();
      let top_level_mark = Mark::new();

      (
        resolver(unresolved_mark, top_level_mark, true),
        visit_mut_pass(JSXTransformer::new(
          super::JSXTransformerConfig {
            preserve_jsx: true,
            ..Default::default()
          },
          Some(t.comments.clone()),
          TransformMode::Test,
          None,
        )),
      )
    },
    basic_full_static_snapshot_extract,
    // Input codes
    r#"let s = __SNAPSHOT__(<view><text>!!!</text></view>);"#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let unresolved_mark = Mark::new();
      let top_level_mark = Mark::new();

      (
        resolver(unresolved_mark, top_level_mark, true),
        visit_mut_pass(JSXTransformer::new(
          super::JSXTransformerConfig {
            preserve_jsx: true,
            ..Default::default()
          },
          Some(t.comments.clone()),
          TransformMode::Test,
          None,
        )),
      )
    },
    basic_full_static_snapshot_extract_it,
    // Input codes
    r#"
    it('basic', async function() {
      const run = withEnv(function() {
        let s = __SNAPSHOT__(<view><text>!!!</text></view>);
      });
      await run();
    });
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    basic_component,
    // Input codes
    r#"
    <view>
      <A/>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    page_component,
    // Input codes
    r#"
    <Page custom-key-str="custom-value" custom-key-var={customVariable} class="classValue" data-attr={dataAttr}>
      <view>
        <Page/>
        <A/>
      </view>
    </Page>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Development,
      None
    )),
    page_element_dev,
    // Input codes
    r#"
    <page custom-key-str="custom-value" custom-key-var={customVariable} class="classValue" data-attr={dataAttr}>
      <view>
        <page />
        <A/>
      </view>
    </page>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    page_element,
    // Input codes
    r#"
    <page custom-key-str="custom-value" custom-key-var={customVariable} class="classValue" data-attr={dataAttr}>
      <view>
        <page />
        <A/>
      </view>
    </page>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    basic_component_with_static_sibling,
    // Input codes
    r#"
    <view>
      <text>!!!</text>
      <A/>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let top_level_mark = Mark::new();
      let unresolved_mark = Mark::new();
      (
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: false,
            ..Default::default()
          },
          None,
          TransformMode::Test,
          None,
        )),
        react::react::<&SingleThreadedComments>(
          t.cm.clone(),
          None,
          react::Options {
            next: Some(false),
            runtime: Some(react::Runtime::Automatic),
            import_source: Some("@lynx-js/react".into()),
            pragma: None,
            pragma_frag: None,
            throw_if_namespace: None,
            development: Some(false),
            refresh: None,
            ..Default::default()
          },
          top_level_mark,
          unresolved_mark,
        ),
      )
    },
    basic_component_with_static_sibling_jsx,
    // Input codes
    r#"
    <view>
      <text>!!!</text>
      <A/>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let top_level_mark = Mark::new();
      let unresolved_mark = Mark::new();
      (
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: false,
            ..Default::default()
          },
          None,
          TransformMode::Test,
          None,
        )),
        react::react::<&SingleThreadedComments>(
          t.cm.clone(),
          None,
          react::Options {
            next: Some(false),
            runtime: Some(react::Runtime::Automatic),
            import_source: Some("@lynx-js/react".into()),
            pragma: None,
            pragma_frag: None,
            throw_if_namespace: None,
            development: Some(true),
            refresh: None,
            ..Default::default()
          },
          top_level_mark,
          unresolved_mark,
        ),
      )
    },
    basic_component_with_static_sibling_jsx_dev,
    // Input codes
    r#"
    <view>
      <text>!!!</text>
      <A/>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    basic_expr_container,
    // Input codes
    r#"
    <view>
      {a}
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    basic_expr_container_with_static_sibling,
    // Input codes
    r#"
    <view>
      <text>!!!</text>
      {a}
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_inject_implicit_flatten,
    // Input codes
    r#"
    <view>
      <view className={'commdityV1Wrapper'}>
        <view id={id} className={'dotComm'} />
        <view className={'commdityV1TextWrapper'}>
          <view className={'commdityV1TextVerticalWrapper'}>
            <ItemTextWithTag/>
            {desc}
          </view>
          {unit}
        </view>
        {unit}
        {unit}
      </view>
    </view>;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    basic_list,
    // Input codes
    r#"
    <view>
      <list>
        <list-item full-span={true} reuse-identifier={x}></list-item>
      </list>
      <view><A/></view>
    </view>;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    basic_list_with_fragment,
    // Input codes
    r#"
    <view>
      <list>
        <>
          <list-item></list-item>
          <list-item></list-item>
        </>
      </list>
      <view><A/></view>
    </view>;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |_| {
      let unresolved_mark = Mark::new();
      let top_level_mark = Mark::new();

      (
        resolver(unresolved_mark, top_level_mark, true),
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: true,
            ..Default::default()
          },
          None,
          TransformMode::Test,
          None,
        )),
      )
    },
    basic_list_toplevel,
    // Input codes
    r#"
    <list>
      <list-item>!!!</list-item>
      <list-item>!!!</list-item>
    </list>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_static_extract_inline_style,
    // Input codes
    r#"
    <view style={{
      backgroundColor: 'red',
      width: '100%',
      height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: '50%',
      opacity: 0.5,
    }} />;
    <view style="background-color: red;" />;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_static_extract_dynamic_inline_style,
    // Input codes
    r#"
    <view style={`background-color: red;`} />;
    <view style={`background-color: red; width: ${w};`} />;
    <view style={{backgroundColor: "red", width: w, height: "100rpx"}} />;
    <view style={{backgroundColor: "red", ...style}} />;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_extract_css_id_without_css_id,
    // Input codes
    r#"
    <view style={`background-color: red;`} />;
    <view style={`background-color: red; width: ${w};`} />;
    <view style={{backgroundColor: "red", width: w, height: "100rpx"}} />;
    <view style={{backgroundColor: "red", ...style}} />;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_extract_css_id,
    // Input codes
    r#"
/**
 * @jsxCSSId 100
 */
    <view style={`background-color: red;`} />;
    <view style={`background-color: red; width: ${w};`} />;
    <view style={{backgroundColor: "red", width: w, height: "100rpx"}} />;
    <view style={{backgroundColor: "red", ...style}} />;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        is_dynamic_component: Some(true),
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_extract_css_id_dynamic_component,
    // Input codes
    r#"
/**
 * @jsxCSSId 100
 */
    <view style={`background-color: red;`} />;
    <view style={`background-color: red; width: ${w};`} />;
    <view style={{backgroundColor: "red", width: w, height: "100rpx"}} />;
    <view style={{backgroundColor: "red", ...style}} />;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        is_dynamic_component: Some(true),
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_extract_css_id_dynamic_component_without_css_id,
    // Input codes
    r#"
    <view style={`background-color: red;`} />;
    <view style={`background-color: red; width: ${w};`} />;
    <view style={{backgroundColor: "red", width: w, height: "100rpx"}} />;
    <view style={{backgroundColor: "red", ...style}} />;
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let top_level_mark = Mark::new();
      let unresolved_mark = Mark::new();
      (
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: false,
            ..Default::default()
          },
          None,
          TransformMode::Test,
          None,
        )),
        react::react::<&SingleThreadedComments>(
          t.cm.clone(),
          None,
          react::Options {
            next: Some(false),
            runtime: Some(react::Runtime::Automatic),
            import_source: Some("@lynx-js/react".into()),
            pragma: None,
            pragma_frag: None,
            throw_if_namespace: None,
            development: Some(false),
            refresh: None,
            ..Default::default()
          },
          top_level_mark,
          unresolved_mark,
        ),
      )
    },
    basic_spread,
    // Input codes
    r#"
    <view>
      <text before={"bbb"} {...obj} after={"aaa"}>!!!</text>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |_| {
      visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
        super::JSXTransformerConfig {
          preserve_jsx: false,
          ..Default::default()
        },
        None,
        TransformMode::Test,
        None,
      ))
    },
    inline_style_literal,
    // Input codes
    r#"
    <view style={{ color: "red", 'height': "100px", flexShrink: 1 }}>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |_| {
      visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
        super::JSXTransformerConfig {
          preserve_jsx: false,
          ..Default::default()
        },
        None,
        TransformMode::Test,
        None,
      ))
    },
    inline_style_literal_unknown_property,
    // Input codes
    r#"
    <view style={{ unknown: "red", height: "100px", display: 'linear', 'unknown-foo': 'bar' }}>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |_| {
      visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
        super::JSXTransformerConfig {
          preserve_jsx: false,
          ..Default::default()
        },
        None,
        TransformMode::Test,
        None,
      ))
    },
    empty_module,
    // Input codes
    r#"
    console.log('hello, world')
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |_| {
      visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
        super::JSXTransformerConfig {
          preserve_jsx: false,
          runtime_pkg: "@lynx-js/react/internal".into(),
          ..Default::default()
        },
        None,
        TransformMode::Development,
        None,
      ))
    },
    mode_development_spread,
    // Input codes
    r#"
    <view {...{ style: { height: "100px" }}} main-thread:bindtap={xxx}>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let top_level_mark = Mark::new();
      let unresolved_mark = Mark::new();
      (
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: false,
            target: TransformTarget::MIXED,
            ..Default::default()
          },
          None,
          TransformMode::Development,
          None,
        )),
        react::react::<&SingleThreadedComments>(
          t.cm.clone(),
          None,
          react::Options {
            next: Some(false),
            runtime: Some(react::Runtime::Automatic),
            import_source: Some("@lynx-js/react".into()),
            pragma: None,
            pragma_frag: None,
            throw_if_namespace: None,
            development: Some(false),
            refresh: None,
            ..Default::default()
          },
          top_level_mark,
          unresolved_mark,
        ),
      )
    },
    basic_event,
    // Input codes
    r#"
    function Comp() {
      const handleTap = () => {}
      return (
        <view>
          <text bindtap={handleTap}>1</text>
        </view>
      )
    }
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let top_level_mark = Mark::new();
      let unresolved_mark = Mark::new();
      (
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: false,
            target: TransformTarget::MIXED,
            ..Default::default()
          },
          None,
          TransformMode::Development,
          None,
        )),
        react::react::<&SingleThreadedComments>(
          t.cm.clone(),
          None,
          react::Options {
            next: Some(false),
            runtime: Some(react::Runtime::Automatic),
            import_source: Some("@lynx-js/react".into()),
            pragma: None,
            pragma_frag: None,
            throw_if_namespace: None,
            development: Some(false),
            refresh: None,
            ..Default::default()
          },
          top_level_mark,
          unresolved_mark,
        ),
      )
    },
    basic_ref,
    // Input codes
    r#"
    function Comp() {
      const handleRef = () => {}
      return (
        <view>
          <text ref={handleRef}>1</text>
          <text bindtap={handleRef}>2</text>
          <text ref={handleRef}>3</text>
        </view>
      )
    }
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let top_level_mark = Mark::new();
      let unresolved_mark = Mark::new();
      (
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: false,
            target: TransformTarget::MIXED,
            ..Default::default()
          },
          None,
          TransformMode::Development,
          None,
        )),
        react::react::<&SingleThreadedComments>(
          t.cm.clone(),
          None,
          react::Options {
            next: Some(false),
            runtime: Some(react::Runtime::Automatic),
            import_source: Some("@lynx-js/react".into()),
            pragma: None,
            pragma_frag: None,
            throw_if_namespace: None,
            development: Some(false),
            refresh: None,
            ..Default::default()
          },
          top_level_mark,
          unresolved_mark,
        ),
      )
    },
    worklet,
    // Input codes
    r#"
    function Comp() {
      const handleTap = () => {}
      const handleRef = () => {}
      return (
        <view>
          <text main-thread:bindtap={handleTap}>1</text>
          <text main-thread:ref={handleRef}>1</text>
        </view>
      )
    }
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let top_level_mark = Mark::new();
      let unresolved_mark = Mark::new();
      (
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: false,
            target: TransformTarget::MIXED,
            ..Default::default()
          },
          None,
          TransformMode::Development,
          None,
        )),
        react::react::<&SingleThreadedComments>(
          t.cm.clone(),
          None,
          react::Options {
            next: Some(false),
            runtime: Some(react::Runtime::Automatic),
            import_source: Some("@lynx-js/react".into()),
            pragma: None,
            pragma_frag: None,
            throw_if_namespace: None,
            development: Some(false),
            refresh: None,
            ..Default::default()
          },
          top_level_mark,
          unresolved_mark,
        ),
      )
    },
    gesture,
    // Input codes
    r#"
    function Comp() {
      const gesture = {}
      return (
        <view>
          <text main-thread:gesture={gesture}>1</text>
        </view>
      )
    }
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| {
      let top_level_mark = Mark::new();
      let unresolved_mark = Mark::new();
      (
        visit_mut_pass(JSXTransformer::<&SingleThreadedComments>::new(
          super::JSXTransformerConfig {
            preserve_jsx: false,
            target: TransformTarget::MIXED,
            ..Default::default()
          },
          None,
          TransformMode::Development,
          None,
        )),
        react::react::<&SingleThreadedComments>(
          t.cm.clone(),
          None,
          react::Options {
            next: Some(false),
            runtime: Some(react::Runtime::Automatic),
            import_source: Some("@lynx-js/react".into()),
            pragma: None,
            pragma_frag: None,
            throw_if_namespace: None,
            development: Some(false),
            refresh: None,
            ..Default::default()
          },
          top_level_mark,
          unresolved_mark,
        ),
      )
    },
    basic_timing_flag,
    // Input codes
    r#"
    function Comp() {
      return (
        <view>
          <text __lynx_timing_flag={'timing_flag'}>1</text>
        </view>
      )
    }
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_escape_newline_character,
    // Input codes
    r#"
    <view>
      <view className="123
456"></view>
      <view className="123
      456"></view>
      <view className="123

456"></view>
      <view className="123\n456"></view>
      <view className="123 456"></view>
      <view className="123  456"></view>
      <view className="123\t456"></view>
      <svg
        content='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M14.3723 11.9999L7.53902 5.16659C7.34376 4.97133 7.34376 4.65475 7.53902 4.45948L8.45826 3.54025C8.65353 3.34498 8.97011 3.34498 9.16537 3.54025L17.2714 11.6463C17.4667 11.8416 17.4667 12.1582 17.2714 12.3534L9.16537 20.4595C8.97011 20.6547 8.65353 20.6547 8.45826 20.4595L7.53902 19.5402C7.34376 19.345 7.34376 19.0284 7.53903 18.8331L14.3723 11.9999Z" fill="white"/>
        </svg>'
        style={{
          width: "24rpx",
          height: "24rpx",
          opacity: "0.4",
        }}
        id="x
y"
        data-attr="x
        y"
        __lynx_timing_flag="
aaaaa
"
      ></svg>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_wrap_dynamic_key,
    // Input codes
    r#"
    <view>
      <text>Hello, ReactLynx, {hello}</text>
      <text key={hello}>{hello}</text>
      <text key="hello">{hello}</text>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_set_attribute_for_text_node,
    // Input codes
    r#"
    <view>
      <text text="Hello World 0"></text>
      <text text=" "></text>
      <text></text>
      <text class="hello" text="Hello World 1"></text>
      <text {...attrs} text="Hello World 2"></text>
      <text text="Hello Lynx" text="Hello World 3"></text>
    </view>
    "#
  );

  test!(
    module,
    Syntax::Es(EsSyntax {
      jsx: true,
      ..Default::default()
    }),
    |t| visit_mut_pass(JSXTransformer::new(
      super::JSXTransformerConfig {
        preserve_jsx: true,
        ..Default::default()
      },
      Some(t.comments.clone()),
      TransformMode::Test,
      None
    )),
    should_create_raw_text_node_for_text_node,
    // Input codes
    r#"
    <view>
      <text>{hello}, ReactLynx 1</text>
      <text>{hello}</text>
      <text>
        Hello
        <text text="ReactLynx 2"></text>
      </text>
      <x-text>Hello, ReactLynx 3</x-text>
    </view>
    "#
  );
}
