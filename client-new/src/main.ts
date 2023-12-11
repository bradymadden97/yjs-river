/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { RiverExtensions } from "./river";
import { YjsExtensions } from "./yjs";

new EditorView({
  extensions: [
    basicSetup,
    javascript(),
    EditorView.contentAttributes.of({
      "data-gramm": "false",
      "data-gramm_editor": "false",
      "data-enabled-grammarly": "false",
    }),
    RiverExtensions,
    YjsExtensions,
  ],
  parent: document.body,
});
