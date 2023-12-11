import { EditorView, ViewPlugin } from "@codemirror/view";
import { getRiverClient } from "./river";
import * as Y from "yjs";
import { EditorState } from "@codemirror/state";
// @ts-ignore
import { yCollab } from "y-codemirror.next";

const YDoc = new Y.Doc();

// This is wacky but it works :)
// I have to store the input type somewhere so I can push to it
type InputType = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof getRiverClient>>["yjs"]["docSync"]["stream"]
  >
>[0];

// Just a hack to allow us to show a "mirror" of the server's doc easily
const isServerMirror = window.location.pathname === "/server";

const YjsRiverConnection = ViewPlugin.define((view) => {
  let client = getRiverClient(view);
  let destroyed = false;
  let input: InputType | undefined = undefined;

  // Push updates from client --> server
  const onUpdate = () => {
    if (input) {
      input.push({ input: Y.encodeStateAsUpdateV2(YDoc), bit: 0 });
    }
  };
  YDoc.on("update", onUpdate);

  // Receive updates from server --> client
  async function setupServerSync() {
    // Hack: if we don't have a client, clear out the stream
    // we should instead receive some kind of "close stream" message
    // from river so we don't have to do this
    if (!client && input) {
      input = undefined;
    }

    // If we already have a stream, don't set up another one
    if (input) {
      return;
    }

    // If we have a working client, set up a stream
    // Store stream to send further updates
    // Send initial message with latest client state
    // Listen for server updates from outstream
    if (client) {
      const stream = await client.yjs.docSync.stream();
      input = stream[0];
      input.push({ input: Y.encodeStateAsUpdateV2(YDoc), bit: 0 });
      for await (const message of stream[1]) {
        // ignore errors for now
        if (!message.ok) {
          continue;
        }

        Y.applyUpdateV2(YDoc, message.payload.update);
      }
    }
  }
  setupServerSync();

  return {
    update: (update) => {
      client = getRiverClient(update.view);
      setupServerSync();
    },
    destroy() {
      YDoc.off("update", onUpdate);
      destroyed = true;
    },
  };
});

export const YjsExtensions = [
  YjsRiverConnection,
  yCollab(YDoc.getText("codemirror"), null, {
    undoManager: new Y.UndoManager(YDoc.getText("codemirror")),
  }),
  EditorView.editable.of(!isServerMirror),
  EditorState.readOnly.of(isServerMirror),
];
