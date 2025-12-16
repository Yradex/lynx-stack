import * as ReactLynx from "@lynx-js/react";
const __snapshot_da39a_test_1 = "__snapshot_da39a_test_1";
const __template_da39a_test_1 = {
    tag: "view",
    attributes: {
        style: "color: red; width: 100px;"
    },
    children: [
        {
            tag: "text",
            attributes: {
                style: "font-size:16px;font-weight:bold",
                text: "Static Style"
            }
        },
        {
            tag: "view",
            attributes: {
                "part-id": 0
            },
            children: [
                {
                    tag: "text",
                    attributes: {
                        text: "Dynamic Style"
                    }
                }
            ]
        }
    ]
};
ReactLynx.__elementTemplateMap = ReactLynx.__elementTemplateMap || {};
ReactLynx.__elementTemplateMap[__snapshot_da39a_test_1] = __template_da39a_test_1;
<__snapshot_da39a_test_1 values={[
    {
        color: dynamicColor
    }
]}/>;
