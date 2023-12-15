import { Facet, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  showPanel,
} from "@codemirror/view";
import { ServerClient, createClient } from "@replit/river";
import { Server } from "../../server-new";
import { WebSocketClientTransport } from "@replit/river/transport/ws/client";
import { nanoid } from "nanoid";

// Just a hack to allow us to show a "mirror" of the server's doc easily
const isServerMirror = window.location.pathname === "/server";

export const UserColor = Facet.define<string, string>({
  combine: (f) => f[0],
});

export const UserId = Facet.define<string, string>({
  combine: (f) => f[0],

  enables: (f) => {
    // Show the user id in the editor for easy debugging
    return [
      UserColor.compute([f], () => {
        return (
          "#" + ((Math.random() * 0xffffff) << 0).toString(16).padStart(6, "0")
        );
      }),
      showPanel.of((v) => {
        const div = document.createElement("div");
        div.textContent = "User ID: " + v.state.facet(f);

        const input = document.createElement("input");
        input.type = "color";
        input.disabled = true;
        input.style.marginLeft = "4px";
        input.value = v.state.facet(UserColor);

        const dom = document.createElement("div");
        dom.style.display = "flex";
        dom.style.alignItems = "center";
        dom.style.padding = "4px";

        dom.appendChild(div);
        if (v.state.facet(f) !== "SERVER MIRROR") {
          dom.appendChild(input);
        }

        return { dom, top: true };
      }),
    ];
  },
});

const toggleConnection = StateEffect.define<boolean>();
const RiverConnectionState = StateField.define<boolean>({
  // Initially connected for all
  create: () => (isServerMirror ? true : true),
  update: (v, tr) => {
    for (const ef of tr.effects) {
      if (ef.is(toggleConnection)) {
        v = ef.value;
      }
    }
    return v;
  },
});
const RiverClientPlugin = ViewPlugin.define(
  (view) => {
    let client: ServerClient<Server> | undefined = undefined;
    let transport: WebSocketClientTransport | undefined;

    function connect() {
      transport = new WebSocketClientTransport(
        async () => new WebSocket(`wss://${window.location.hostname}:9000`),
        view.state.facet(UserId),
        "SERVER"
      );
      client = createClient<Server>(transport, "SERVER");
    }

    function disconnect() {
      transport?.close();
      transport = undefined;
      client = undefined;
    }

    if (view.state.field(RiverConnectionState)) {
      connect();
    }

    window.addEventListener("beforeunload", disconnect);

    return {
      getClient() {
        return client;
      },
      update: (update) => {
        if (
          update.startState.field(RiverConnectionState) !==
          update.state.field(RiverConnectionState)
        ) {
          update.state.field(RiverConnectionState) ? connect() : disconnect();
        }
      },
      destroy: () => {
        window.removeEventListener("beforeunload", disconnect);
        disconnect();
      },
    };
  },
  {
    provide: () =>
      showPanel.of((view) => {
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.id = "connection";
        toggle.checked = view.state.field(RiverConnectionState);
        toggle.disabled = isServerMirror;
        toggle.onchange = (e) => {
          view.dispatch({
            effects: toggleConnection.of(
              (e.target as HTMLInputElement).checked
            ),
          });
        };
        const label = document.createElement("label");
        label.setAttribute("for", "connection");
        label.textContent = toggle.checked ? "Connected" : "Disconnected";
        label.style.marginLeft = "4px";
        label.style.userSelect = "none";

        const dom = document.createElement("div");
        dom.style.padding = "4px";
        dom.style.display = "flex";
        dom.appendChild(toggle);
        dom.appendChild(label);

        function update(update: ViewUpdate) {
          toggle.checked = update.state.field(RiverConnectionState);
          label.textContent = toggle.checked ? "Connected" : "Disconnected";
        }

        return { dom, update, top: true };
      }),
  }
);

export function getRiverClient(view: EditorView) {
  return view.plugin(RiverClientPlugin)?.getClient();
}

export const RiverExtensions = [
  UserId.of(isServerMirror ? "SERVER MIRROR" : nanoid()),
  RiverConnectionState,
  RiverClientPlugin,
];
