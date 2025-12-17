use swc_core::ecma::transforms::testing::test;
use swc_core::ecma::{
  parser::{EsSyntax, Syntax},
  visit::visit_mut_pass,
};
use swc_plugin_snapshot::{JSXTransformer, JSXTransformerConfig};
use swc_plugins_shared::target::TransformTarget;
use swc_plugins_shared::transform_mode::TransformMode;

test!(
  module,
  Syntax::Es(EsSyntax {
    jsx: true,
    ..Default::default()
  }),
  |t| visit_mut_pass(JSXTransformer::new(
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      target: TransformTarget::LEPUS,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_output_element_template_simple_lepus,
  // Input codes
  r#"
    <view class="container">
      <text>Hello</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      target: TransformTarget::JS,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_output_element_template_simple_js,
  // Input codes
  r#"
    <view class="container">
      <text>Hello</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_output_template_with_static_attributes,
  // Input codes
  r#"
    <view class="container" id="main" style="color: red;">
        <text>Hello</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: false,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_not_output_template_when_flag_is_false,
  // Input codes
  r#"
    <view>
        <text>Normal Snapshot</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_dataset_attributes,
  // Input codes
  r#"
    <view data-id="123" data-name="test" data-long-name="long-value">
        <text>Dataset Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_nested_structure_and_dynamic_content,
  // Input codes
  r#"
    <view class="wrapper">
        <view class="header">
            <text>Header</text>
        </view>
        <view class="content">
            {/* Expression should become an elementSlot */}
            {items.map(item => <text>{item}</text>)}
        </view>
        <view class="footer">
            <text>Footer</text>
            {/* Another slot */}
            {showCopyright && <text>Copyright</text>}
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
  |t| visit_mut_pass(JSXTransformer::new(
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_ignore_dynamic_attributes,
  // Input codes
  r#"
    <view class="container" id={dynamicId} style={{color: 'red'}}>
        <text>Dynamic Attribute Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_mixed_content,
  // Input codes
  r#"
    <view>
        <text>Start</text>
        {dynamicPart}
        <view>Middle</view>
        <text>End</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_boolean_and_number_attributes,
  // Input codes
  r#"
    <view disabled={true} opacity={0.5} lines={2}>
        <text>Attribute Types Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_generate_part_ids_for_dynamic_attributes,
  // Input codes
  r#"
    <view class="static" id={dynamicId}>
        <text data-value={value}>Dynamic Value</text>
        <view>Static</view>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_complex_text_structure,
  // Input codes
  r#"
    <view>
        <text>
            Hello
            <text>World</text>
            !
        </text>
        <text>
             First
             <text>Second</text>
             Third
        </text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_spread_attributes,
  // Input codes
  r#"
    <view {...props} data-extra="value">
        <text>Spread Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      target: TransformTarget::LEPUS,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_events_lepus,
  // Input codes
  r#"
    <view bindtap={handleTap} catchtouchstart={handleTouch}>
        <text>Event Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      target: TransformTarget::JS,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_events_js,
  // Input codes
  r#"
    <view bindtap={handleTap} catchtouchstart={handleTouch}>
        <text>Event Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_inline_styles,
  // Input codes
  r#"
    <view style="color: red; width: 100px;">
        <text style={{ fontSize: '16px', fontWeight: 'bold' }}>Static Style</text>
        <view style={{ color: dynamicColor }}>Dynamic Style</view>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      target: TransformTarget::LEPUS,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_refs_lepus,
  // Input codes
  r#"
    <view ref={viewRef}>
        <text>Ref Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      target: TransformTarget::JS,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_refs_js,
  // Input codes
  r#"
    <view ref={viewRef}>
        <text>Ref Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_css_id,
  // Input codes
  r#"
/**
 * @jsxCSSId 100
 */
    <view class="container">
        <text>CSS ID Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_page_element,
  // Input codes
  r#"
    <page>
        <view>Page Element Test</view>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_text_attributes,
  // Input codes
  r#"
    <view>
        <text text="Explicit Text Attribute" />
        <text text={dynamicText} />
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_dynamic_class_attributes,
  // Input codes
  r#"
    <view class={dynamicClass} className="static-class">
        <text>Dynamic Class Test</text>
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
    JSXTransformerConfig {
      preserve_jsx: true,
      experimental_enable_element_template: true,
      ..Default::default()
    },
    Some(t.comments.clone()),
    TransformMode::Test,
    None,
  )),
  should_handle_id_attributes,
  // Input codes
  r#"
    <view id="static-id">
        <text id={dynamicId}>ID Test</text>
    </view>
    "#
);

#[test]
fn should_collect_element_templates_manually() {
  use std::cell::RefCell;
  use std::rc::Rc;
  use swc_core::common::{comments::SingleThreadedComments, FileName, Globals, SourceMap, GLOBALS};
  use swc_core::ecma::parser::{lexer::Lexer, Parser, StringInput};
  use swc_core::ecma::visit::VisitMutWith;

  GLOBALS.set(&Globals::new(), || {
    let cm = Rc::new(SourceMap::default());
    let fm = cm.new_source_file(
      FileName::Anon.into(),
      String::from(
        r#"
      <view>
          <text>Hello</text>
      </view>
  "#,
      ),
    );

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
    let module_result = parser.parse_module();
    let mut module = module_result.expect("Failed to parse module");

    let comments = SingleThreadedComments::default();

    let element_templates = Rc::new(RefCell::new(vec![]));

    let mut transformer = JSXTransformer::new(
      JSXTransformerConfig {
        preserve_jsx: true,
        experimental_enable_element_template: true,
        ..Default::default()
      },
      Some(comments),
      TransformMode::Test,
      Some(element_templates.clone()),
    );

    module.visit_mut_with(&mut transformer);

    let templates = element_templates.borrow();
    assert!(!templates.is_empty(), "Should collect element templates");
    assert_eq!(templates.len(), 1, "Should optimize 1 element template");

    let template = &templates[0];
    let json = &template.compiled_template;

    let expected = serde_json::json!({
      "tag": "view",
      "children": [
        {
          "tag": "text",
          "attributes": { "text": "Hello" },
        },
      ],
    });
    assert_eq!(json, &expected);
  });
}
