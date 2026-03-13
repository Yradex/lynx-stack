use serde_json::Value;
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;
use swc_core::common::{comments::SingleThreadedComments, FileName, Globals, SourceMap, GLOBALS};
use swc_core::ecma::codegen::{text_writer::JsWriter, Emitter};
use swc_core::ecma::parser::{lexer::Lexer, EsSyntax, Parser, StringInput, Syntax};
use swc_core::ecma::visit::VisitMutWith;
use swc_plugin_snapshot::{ElementTemplateAsset, JSXTransformer, JSXTransformerConfig};
use swc_plugins_shared::transform_mode::TransformMode;

const BUILTIN_RAW_TEXT_TEMPLATE_ID: &str = "__et_builtin_raw_text__";

fn transform_to_templates(input: &str, cfg: JSXTransformerConfig) -> Vec<ElementTemplateAsset> {
  GLOBALS.set(&Globals::new(), || {
    let cm: Arc<SourceMap> = Arc::new(SourceMap::default());
    let fm = cm.new_source_file(FileName::Anon.into(), input.to_string());

    let lexer = Lexer::new(
      Syntax::Es(EsSyntax {
        jsx: true,
        ..Default::default()
      }),
      Default::default(),
      StringInput::from(&*fm),
      None,
    );

    let mut parser = Parser::new_from(lexer);
    let mut module = parser.parse_module().expect("Failed to parse module");

    let comments = SingleThreadedComments::default();
    let element_templates = Rc::new(RefCell::new(vec![]));

    let mut transformer = JSXTransformer::new(
      cfg,
      Some(comments),
      TransformMode::Test,
      Some(element_templates.clone()),
    );

    module.visit_mut_with(&mut transformer);

    let mut sink = vec![];
    let mut emitter = Emitter {
      cfg: swc_core::ecma::codegen::Config::default(),
      cm: cm.clone(),
      comments: None,
      wr: JsWriter::new(cm.clone(), "\n", &mut sink, None),
    };
    emitter.emit_module(&module).expect("Failed to emit module");

    let templates = element_templates.borrow_mut().drain(..).collect();
    templates
  })
}

fn first_user_template_json(input: &str) -> Value {
  let templates = transform_to_templates(
    input,
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
  );

  templates
    .into_iter()
    .find(|template| template.template_id != BUILTIN_RAW_TEXT_TEMPLATE_ID)
    .map(|template| {
      serde_json::to_value(template.compiled_template).expect("compiled template to json")
    })
    .expect("should collect a user template")
}

#[test]
fn should_keep_slot_descriptor_order_for_dynamic_attr_spread_event_and_ref() {
  let template = first_user_template_json(
    r#"
      <view id={dynamicId} {...props} bindtap={handleTap} ref={viewRef} />
    "#,
  );

  let attrs = template["attributesArray"]
    .as_array()
    .expect("attributesArray");
  assert_eq!(attrs.len(), 4);

  assert_eq!(attrs[0]["kind"], "attribute");
  assert_eq!(attrs[0]["key"], "id");
  assert_eq!(attrs[0]["binding"], "slot");
  assert_eq!(attrs[0]["attrSlotIndex"].as_f64(), Some(0.0));

  assert_eq!(attrs[1]["kind"], "spread");
  assert_eq!(attrs[1]["binding"], "slot");
  assert_eq!(attrs[1]["attrSlotIndex"].as_f64(), Some(1.0));

  assert_eq!(attrs[2]["kind"], "attribute");
  assert_eq!(attrs[2]["key"], "bindtap");
  assert_eq!(attrs[2]["binding"], "slot");
  assert_eq!(attrs[2]["attrSlotIndex"].as_f64(), Some(2.0));

  assert_eq!(attrs[3]["kind"], "attribute");
  assert_eq!(attrs[3]["key"], "ref");
  assert_eq!(attrs[3]["binding"], "slot");
  assert_eq!(attrs[3]["attrSlotIndex"].as_f64(), Some(3.0));
}

#[test]
fn should_keep_element_slot_indices_stable_for_mixed_dynamic_children() {
  let template = first_user_template_json(
    r#"
      <view>
        <text>static</text>
        {first}
        <image />
        {second}
      </view>
    "#,
  );

  let children = template["children"].as_array().expect("children array");
  assert_eq!(children[0]["kind"], "element");
  assert_eq!(children[0]["tag"], "text");
  assert_eq!(children[1]["kind"], "elementSlot");
  assert_eq!(children[1]["elementSlotIndex"].as_f64(), Some(0.0));
  assert_eq!(children[1]["tag"], "slot");
  assert_eq!(children[2]["kind"], "element");
  assert_eq!(children[2]["tag"], "image");
  assert_eq!(children[3]["kind"], "elementSlot");
  assert_eq!(children[3]["elementSlotIndex"].as_f64(), Some(1.0));
  assert_eq!(children[3]["tag"], "slot");
}
