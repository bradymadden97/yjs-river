import { Ok, ServiceBuilder } from "@replit/river";
import { reply } from "@replit/river/transport";
import { Type } from "@sinclair/typebox";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness.js";
import * as Y from "yjs";

class SharedDoc extends Y.Doc {
  connections: Map<string, (bit: 0 | 1, update: Uint8Array) => void>;
  awareness: Awareness;

  constructor() {
    super();
    this.connections = new Map();

    this.awareness = new Awareness(this);
    this.awareness.setLocalState(null);
    this.awareness.on("update", ({ added, updated, removed }) => {
      const changed = added.concat(updated, removed);
      for (const [_id, sync] of this.connections) {
        sync(1, encodeAwarenessUpdate(this.awareness, changed));
      }
    });

    this.on("update", (_a, _b, doc: Y.Doc) => {
      for (const [_id, sync] of this.connections) {
        sync(0, Y.encodeStateAsUpdateV2(doc));
      }
    });
  }
}

const SYNC_DOC = 0;
const SYNC_AWARE = 1;

export const YjsServiceConstructor = () =>
  ServiceBuilder.create("yjs")
    .initialState({
      doc: new SharedDoc(),
    })

    /**
     * stream connection to sync changes from client doc <---> server doc
     */
    .defineProcedure("docSync", {
      type: "stream",
      input: Type.Union([
        // Unions seem to be unsupported currently
        // Type.Object({ connect: Type.Literal(true) }),
        Type.Object({
          bit: Type.Union([Type.Literal(SYNC_DOC), Type.Literal(SYNC_AWARE)]),
          input: Type.Uint8Array(),
        }),
      ]),
      output: Type.Object({
        bit: Type.Union([Type.Literal(SYNC_DOC), Type.Literal(SYNC_AWARE)]),
        update: Type.Uint8Array(),
      }),
      errors: Type.Never(),
      async handler(ctx, i, o) {
        let from: string | undefined = undefined;
        let initialMessage = true;

        for await (const msg of i) {
          console.log(
            "Msg from",
            msg.from,
            ctx.state.doc.connections.size,
            Array.from(ctx.state.doc.connections.keys()),
            msg
          );
          // Add connection when stream begins
          // We should be able to just check if we already have a connection
          // setup for `msg.from`, but we don't get a "close" mesage to
          // remove the stream from the map, so the map stays populated.
          // Reconnects wouldn't overwrite with the new input
          if (initialMessage) {
            from = msg.from;
            initialMessage = false;
            ctx.state.doc.connections.set(msg.from, (bit, update) => {
              o.push(reply(msg, Ok({ bit, update })));
            });

            // Respond with initial server state
            const initialServerState = Y.encodeStateAsUpdateV2(ctx.state.doc);
            o.push(reply(msg, Ok({ bit: 0, update: initialServerState })));
          }

          // If the client is a "server mirror", we're just displaying what's
          // on the server. Don't actually try to _apply_ client updates
          // to the server. This should really be a separate subscription but
          // I'd like to share client code for now.
          if (msg.from === "SERVER MIRROR") {
            continue;
          }

          // Apply client updates to the shared doc
          if (msg.payload.bit === SYNC_DOC) {
            Y.applyUpdateV2(ctx.state.doc, msg.payload.input);
          }
          // Apply client awareness updates to the shared doc
          if (msg.payload.bit === SYNC_AWARE) {
            applyAwarenessUpdate(
              ctx.state.doc.awareness,
              msg.payload.input,
              msg.from
            );
          }
        }

        console.log("Did we make it here with a stream?");

        // Remove connection when stream ends
        // This is not running as we're not getting a close message from client
        if (from) {
          ctx.state.doc.connections.delete(from);
        }
      },
    })

    .finalize();
