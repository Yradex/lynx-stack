use napi_derive::napi;
use swc_core::{
  common::comments::Comments,
  ecma::{ast::*, visit::VisitMut},
};
use swc_plugins_shared::{target_napi::TransformTarget, transform_mode_napi::TransformMode};

use crate::{
  ElementTemplateAsset as CoreElementTemplateAsset, JSXTransformer as CoreJSXTransformer,
  JSXTransformerConfig as CoreJSXTransformerConfig,
};
use std::cell::RefCell;
use std::rc::Rc;

/// @internal
#[napi(object)]
#[derive(Clone, Debug)]
pub struct ElementTemplateAsset {
  #[napi(js_name = "templateId")]
  pub template_id: String,
  #[napi(js_name = "compiledTemplate")]
  pub compiled_template: serde_json::Value,
  #[napi(js_name = "sourceFile")]
  pub source_file: String,
}

impl From<CoreElementTemplateAsset> for ElementTemplateAsset {
  fn from(val: CoreElementTemplateAsset) -> Self {
    Self {
      template_id: val.template_id,
      compiled_template: val.compiled_template,
      source_file: val.source_file,
    }
  }
}

/// @internal
#[napi(object)]
#[derive(Clone, Debug)]
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
  #[napi(ts_type = "'LEPUS' | 'JS' | 'MIXED'")]
  pub target: TransformTarget,
  /// @internal
  pub is_dynamic_component: Option<bool>,
  /// @internal
  pub experimental_enable_element_template: Option<bool>,
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
      experimental_enable_element_template: None,
    }
  }
}

impl From<JSXTransformerConfig> for CoreJSXTransformerConfig {
  fn from(val: JSXTransformerConfig) -> Self {
    Self {
      preserve_jsx: val.preserve_jsx,
      runtime_pkg: val.runtime_pkg,
      jsx_import_source: val.jsx_import_source,
      filename: val.filename,
      target: val.target.into(),
      is_dynamic_component: val.is_dynamic_component,
      experimental_enable_element_template: val
        .experimental_enable_element_template
        .unwrap_or(false),
    }
  }
}

impl From<CoreJSXTransformerConfig> for JSXTransformerConfig {
  fn from(val: CoreJSXTransformerConfig) -> Self {
    Self {
      preserve_jsx: val.preserve_jsx,
      runtime_pkg: val.runtime_pkg,
      jsx_import_source: val.jsx_import_source,
      filename: val.filename,
      target: val.target.into(),
      is_dynamic_component: val.is_dynamic_component,
      experimental_enable_element_template: Some(val.experimental_enable_element_template),
    }
  }
}

pub struct JSXTransformer<C>
where
  C: Comments + Clone,
{
  inner: CoreJSXTransformer<C>,
  pub element_templates: Rc<RefCell<Vec<CoreElementTemplateAsset>>>,
}

impl<C> JSXTransformer<C>
where
  C: Comments + Clone,
{
  pub fn with_content_hash(mut self, content_hash: String) -> Self {
    self.inner.content_hash = content_hash;
    self
  }

  pub fn new(cfg: JSXTransformerConfig, comments: Option<C>, mode: TransformMode) -> Self {
    let element_templates = Rc::new(RefCell::new(vec![]));
    Self {
      inner: CoreJSXTransformer::new(
        cfg.into(),
        comments,
        mode.into(),
        Some(element_templates.clone()),
      ),
      element_templates,
    }
  }

  pub fn take_element_templates(&self) -> Vec<CoreElementTemplateAsset> {
    self.element_templates.borrow_mut().drain(..).collect()
  }
}

impl<C> VisitMut for JSXTransformer<C>
where
  C: Comments + Clone,
{
  fn visit_mut_jsx_element(&mut self, node: &mut JSXElement) {
    self.inner.visit_mut_jsx_element(node)
  }

  fn visit_mut_module_items(&mut self, n: &mut Vec<ModuleItem>) {
    self.inner.visit_mut_module_items(n)
  }

  fn visit_mut_module(&mut self, n: &mut Module) {
    self.inner.visit_mut_module(n)
  }
}
