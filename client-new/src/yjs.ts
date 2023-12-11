import { EditorView, ViewPlugin, showPanel } from "@codemirror/view";
import { UserColor, UserId, getRiverClient } from "./river";
import * as Y from "yjs";
import { EditorState, Facet, StateField } from "@codemirror/state";
// @ts-ignore
import { yCollab } from "y-codemirror.next";
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
} from "y-protocols/awareness.js";

const YDoc = new Y.Doc();
const YAwareness = new Awareness(YDoc);

// This is wacky but it works :)
// I have to store the input type somewhere so I can push to it
type InputType = Awaited<
  ReturnType<
    NonNullable<ReturnType<typeof getRiverClient>>["yjs"]["docSync"]["stream"]
  >
>[0];

// Just a hack to allow us to show a "mirror" of the server's doc easily
const isServerMirror = window.location.pathname === "/server";

const YjsRiverConnection = ViewPlugin.define(
  (view) => {
    console.log(view.state.facet(UserId));

    let client = getRiverClient(view);
    let destroyed = false;
    let input: InputType | undefined = undefined;
    let close = () => {
      console.log("that didntwork");
    };

    YAwareness.setLocalStateField("user", {
      name: view.state.facet(UserId),
      color: view.state.facet(UserColor),
      colorLight: view.state.facet(UserColor),
    });

    // Push updates from client --> server
    const onUpdateDoc = () => {
      console.log(YDoc.clientID);
      if (input) {
        input.push({ input: Y.encodeStateAsUpdateV2(YDoc), bit: 0 });
      }
    };
    const onUpdateAwareness = ({ added, updated, removed }) => {
      const changedClients = added.concat(updated).concat(removed);
      console.log(added, updated, removed);
      if (input) {
        input.push({
          input: encodeAwarenessUpdate(YAwareness, changedClients),
          bit: 1,
        });
      }
    };
    YDoc.on("update", onUpdateDoc);
    console.log("client id", YDoc.clientID);
    YAwareness.on("update", onUpdateAwareness);

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
        input.push({
          input: encodeAwarenessUpdate(YAwareness, [
            /* This should really be the same as the river uid */
            YDoc.clientID,
          ]),
          bit: 1,
        });
        console.log("wat");
        console.log("Setting close to", stream[2]);
        close = stream[2];
        for await (const message of stream[1]) {
          console.log("Recv", message);
          // ignore errors for now
          if (!message.ok) {
            continue;
          }

          if (message.payload.bit === 0) {
            Y.applyUpdateV2(YDoc, message.payload.update);
          }

          if (message.payload.bit === 1) {
            // console.log("Got an awareness update!", message);
            console.log("States", YAwareness.getStates());

            applyAwarenessUpdate(
              YAwareness,
              message.payload.update,
              YDoc.clientID
            );
          }
        }

        console.log("Did stream end??");
      }
    }
    setupServerSync();

    return {
      update: (update) => {
        client = getRiverClient(update.view);
        setupServerSync();
      },
      kill: () => {
        console.log("Actually tryign to kill");
        close();
      },
      destroy() {
        YDoc.off("update", onUpdateDoc);
        YAwareness.off("update", onUpdateAwareness);
        destroyed = true;
      },
    };
  },
  {
    provide: (p) => {
      // showPanel.of((v) => {
      //   const btn = document.createElement("button");
      //   btn.textContent = "Kill stream";
      //   btn.onclick = () => {
      //     v.plugin(p)?.kill();
      //   };

      //   const dom = document.createElement("div");
      //   dom.append(btn);

      //   return { dom };
      // }),

      return [];
    },
  }
);

export const YjsExtensions = [
  YjsRiverConnection,
  yCollab(YDoc.getText("codemirror"), YAwareness, {
    undoManager: new Y.UndoManager(YDoc.getText("codemirror")),
  }),

  EditorView.editable.of(!isServerMirror),
  EditorState.readOnly.of(isServerMirror),
];
