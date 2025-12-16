import * as ReactLynx from "@lynx-js/react";
const __snapshot_da39a_test_2 = "__snapshot_da39a_test_2";
const __template_da39a_test_2 = {
    tag: "text",
    children: [
        {
            tag: "slot",
            attributes: {
                "part-id": 0
            }
        }
    ]
};
ReactLynx.__elementTemplateMap = ReactLynx.__elementTemplateMap || {};
ReactLynx.__elementTemplateMap[__snapshot_da39a_test_2] = __template_da39a_test_2;
const __snapshot_da39a_test_3 = "__snapshot_da39a_test_3";
const __template_da39a_test_3 = {
    tag: "text",
    attributes: {
        text: "Copyright"
    }
};
ReactLynx.__elementTemplateMap = ReactLynx.__elementTemplateMap || {};
ReactLynx.__elementTemplateMap[__snapshot_da39a_test_3] = __template_da39a_test_3;
const __snapshot_da39a_test_1 = "__snapshot_da39a_test_1";
const __template_da39a_test_1 = {
    tag: "view",
    attributes: {
        class: "wrapper"
    },
    children: [
        {
            tag: "view",
            attributes: {
                class: "header"
            },
            children: [
                {
                    tag: "text",
                    attributes: {
                        text: "Header"
                    }
                }
            ]
        },
        {
            tag: "view",
            attributes: {
                class: "content"
            },
            children: [
                {
                    tag: "slot",
                    attributes: {
                        "part-id": 0
                    }
                }
            ]
        },
        {
            tag: "view",
            attributes: {
                class: "footer"
            },
            children: [
                {
                    tag: "text",
                    attributes: {
                        text: "Footer"
                    }
                },
                {
                    tag: "slot",
                    attributes: {
                        "part-id": 1
                    }
                }
            ]
        }
    ]
};
ReactLynx.__elementTemplateMap = ReactLynx.__elementTemplateMap || {};
ReactLynx.__elementTemplateMap[__snapshot_da39a_test_1] = __template_da39a_test_1;
<__snapshot_da39a_test_1>{items.map((item)=><__snapshot_da39a_test_2>{item}</__snapshot_da39a_test_2>)}{showCopyright && <__snapshot_da39a_test_3/>}</__snapshot_da39a_test_1>;
