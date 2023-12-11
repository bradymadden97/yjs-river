import { Ok, ServiceBuilder } from "@replit/river";
import { reply } from "@replit/river/transport";
import { Type } from "@sinclair/typebox";
import * as Y from "yjs";

class SharedDoc extends Y.Doc {
  connections: Map<string, (update: Uint8Array) => void>;

  constructor() {
    super();
    this.connections = new Map();
    this.on("update", (_a, _b, doc: Y.Doc) => {
      for (const [_id, sync] of this.connections) {
        sync(Y.encodeStateAsUpdateV2(doc));
      }
    });
  }
}

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
        Type.Object({ input: Type.Uint8Array() }),
      ]),
      output: Type.Object({ update: Type.Uint8Array() }),
      errors: Type.Never(),
      async handler(ctx, i, o) {
        let from: string | undefined = undefined;
        let initialMessage = true;

        for await (const msg of i) {
          // Add connection when stream begins
          // We should be able to just check if we already have a connection
          // setup for `msg.from`, but we don't get a "close" mesage to
          // remove the stream from the map, so the map stays populated.
          // Reconnects wouldn't overwrite with the new input
          if (initialMessage) {
            from = msg.from;
            initialMessage = false;
            ctx.state.doc.connections.set(msg.from, (update: Uint8Array) => {
              o.push(reply(msg, Ok({ update })));
            });

            const initialServerState = Y.encodeStateAsUpdateV2(ctx.state.doc);
            o.push(reply(msg, Ok({ update: initialServerState })));
          }

          // If the client is a "server mirror", we're just displaying what's
          // on the server. Don't actually try to _apply_ client updates
          // to the server. This should really be a separate subscription but
          // I'd like to share client code for now.
          if (msg.from === "SERVER MIRROR") {
            continue;
          }

          // Apply client updates to the shared doc
          Y.applyUpdateV2(ctx.state.doc, msg.payload.input);
        }

        // Remove connection when stream ends
        // This is not running as we're not getting a close message from client
        if (from) {
          ctx.state.doc.connections.delete(from);
        }
      },
    })

    .finalize();
