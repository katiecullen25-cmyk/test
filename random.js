import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import * as monaco from "monaco-editor";
import { initComments } from "./comment.js";
import { initTabs } from "./tabs.js";
import { initChat } from "./chat.js";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import {
    loadAccessInfo,
    applyRoleUi,
    initTerminal,
    initAccessPanel,
    startAccessPolling,
} from "./access-ui.js";

const API = "http://localhost:3000";

self.MonacoEnvironment = {
    getWorker(_, label) {
        if (label === "json") return new jsonWorker();
        if (label === "css" || label === "scss" || label === "less")
            return new cssWorker();
        if (label === "html" || label === "handlebars" || label === "razor")
            return new htmlWorker();
        if (label === "typescript" || label === "javascript") return new tsWorker();
        return new editorWorker();
    },
};

monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

const compilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    noEmit: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: false,
    jsx: monaco.languages.typescript.JsxEmit.React,
};

monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
    compilerOptions,
);
monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
    compilerOptions,
);

async function fetchJson(url, opts = {}) {
    const res = await fetch(url, { credentials: "include", ...opts });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function getMe() {
    const res = await fetch(`${API}/api/me`, { credentials: "include" });
    if (!res.ok) return null;
    return res.json();
}

async function requireAuth() {
    const me = await getMe();
    if (!me || !me.loggedIn) {
        window.location.href = "/";
        return null;
    }
    return me;
}

async function doLogout() {
    const btn = document.getElementById("profile-logout-btn");
    btn.disabled = true;
    btn.textContent = "Logging out...";

    try {
        await fetch(`${API}/auth/logout`, {
            method: "POST",
            credentials: "include",
        }).catch(() => null);
    } finally {
        window.location.href = "/";
    }
}

const me = await requireAuth();
if (!me) throw new Error("Not authenticated");

// Terminal
import { openTerminal } from "./terminal.js";

//function to get files language based on . type
function languageType(filePath) {
    const end = filePath.split(".").pop()?.toLowerCase();

    switch (end) {
        case "js":
            return "javascript";
        case "ts":
            return "typescript";
        case "json":
            return "json";
        case "html":
            return "html";
        case "css":
            return "css";
        case "md":
            return "markdown";
        case "py":
            return "python";
        case "java":
            return "java";
        case "c":
            return "c";
        case "cpp":
            return "cpp";
        case "h":
            return "cpp";
        case "sh":
            return "shell";
        case "yml":
        case "yaml":
            return "yaml";
        default:
            return "plaintext";
    }
}

const USER_COLOURS = [
    "hsl(0 80% 55%)",
    "hsl(120 80% 55%)",
    "hsl(220 80% 55%)",
    "hsl(300 80% 55%)",
];

function colourFromString(str) {
    //maps a username to a colour
    const safe = str || "User"; //if str undefined use keyword User
    const index = safe.length % USER_COLOURS.length; //maps to index
    return USER_COLOURS[index];
}

const meColour = colourFromString(me.name || me.login || "User"); //assign user colour
const tabsUi = initTabs();

const params = new URLSearchParams(window.location.search); //just getting everything after the ? in url
const repo = params.get("repo");
const repoLabelEl = document.getElementById("repo-label"); //repo-label just repo currently working on
if (repoLabelEl)
    repoLabelEl.textContent = repo ? `Repo: ${repo}` : "Repo: (none)"; //getting repo name

if (!repo) {
    console.warn("No repo in URL. Open a repo from repos.html first.");
}

const editorEl = document.getElementById("editor"); //editor is just the monaco block
if (!editorEl) throw new Error("Missing #editor element in main.html");

const editor = monaco.editor.create(editorEl, {
    value: "// Pick a file from the left\n",
    language: "javascript",
    automaticLayout: true,
    minimap: { enabled: true },
    suggestOnTriggerCharacters: true,
    quickSuggestions: {
        other: true,
        comments: false,
        strings: true,
    },
    parameterHints: { enabled: true },
    inlineSuggest: { enabled: true },
    wordBasedSuggestions: "currentDocument",
    tabCompletion: "on",
    acceptSuggestionOnEnter: "on",
    formatOnPaste: true,
    formatOnType: true,
    bracketPairColorization: { enabled: true },
    guides: {
        bracketPairs: true,
        indentation: true,
    },
});

//monaco references
/*https://microsoft.github.io/monaco-editor/
 */

const filesToggleBtn = document.getElementById("files-toggle-btn");
const fileTreeShell = document.querySelector(".file-tree-shell");

filesToggleBtn?.addEventListener("click", () => {
    fileTreeShell?.classList.toggle("collapsed");
    filesToggleBtn.classList.toggle("active");
});

const accessToggleBtn = document.getElementById("access-toggle-btn");

accessToggleBtn?.addEventListener("click", async () => {
    const panel = document.getElementById("access-panel");
    const tbody = document.getElementById("access-members-body");

    if (!panel || !tbody) return;

    // trigger render manually
    const event = new Event("open-access-panel");
    document.dispatchEvent(event);

    panel.classList.remove("hidden");
});

const treeContextMenu = document.getElementById("tree-context-menu");
const treeRenameBtn = document.getElementById("tree-rename-btn");
const treeDeleteBtn = document.getElementById("tree-delete-btn");

function hideTreeContextMenu() {
    treeContextMenu?.classList.add("hidden");
}

function showTreeContextMenu(x, y) {
    if (!treeContextMenu) return;

    treeContextMenu.style.left = `${x}px`;
    treeContextMenu.style.top = `${y}px`;
    treeContextMenu.classList.remove("hidden");
}

treeDeleteBtn?.classList.add("danger");

document.addEventListener("click", () => {
    treeContextMenu?.classList.add("hidden");
});

treeRenameBtn?.addEventListener("click", () => {
    treeContextMenu?.classList.add("hidden");
    apiRename().catch((e) => alert(e.message));
});

treeDeleteBtn?.addEventListener("click", () => {
    treeContextMenu?.classList.add("hidden");
    apiDelete().catch((e) => alert(e.message));
});

const chatPanel = document.getElementById("chat-panel");
const hideChatPanelBtn = document.getElementById("hide-chat-panel-btn");
const toggleChatPanelBtn = document.getElementById("toggle-chat-panel-btn");

function hideChatPanel() {
    if (!chatPanel) return;
    chatPanel.hidden = true;

    requestAnimationFrame(() => {
        editor.layout();
    });
}

function showChatPanel() {
    if (!chatPanel) return;
    chatPanel.hidden = false;

    requestAnimationFrame(() => {
        editor.layout();
    });
}

hideChatPanelBtn?.addEventListener("click", hideChatPanel);

toggleChatPanelBtn?.addEventListener("click", () => {
    if (!chatPanel) return;

    if (chatPanel.hidden) {
        showChatPanel();
    } else {
        hideChatPanel();
    }
});

const gitToggleBtn = document.getElementById("git-toggle-btn");
const gitPanel = document.getElementById("git-panel");
const closeGitPanelBtn = document.getElementById("close-git-panel-btn");
const gitCommitBtn = document.getElementById("git-commit-btn");
const gitPushBtn = document.getElementById("git-push-btn");
const commitMessageInput = document.getElementById("commit-message-input");

function openGitPanel() {
    gitPanel?.classList.remove("hidden");
    gitToggleBtn?.classList.add("active");
}

function closeGitPanel() {
    gitPanel?.classList.add("hidden");
    gitToggleBtn?.classList.remove("active");
}

gitToggleBtn?.addEventListener("click", () => {
    if (gitPanel?.classList.contains("hidden")) {
        openGitPanel();
    } else {
        closeGitPanel();
    }
});

closeGitPanelBtn?.addEventListener("click", closeGitPanel);

const profileBtn = document.getElementById("profile-btn");
const profileMenu = document.getElementById("profile-menu");
const profileName = document.getElementById("profile-name");
const profileInitials = document.getElementById("profile-initials");
const profileGithubBtn = document.getElementById("profile-github-btn");
const profileLogoutBtn = document.getElementById("profile-logout-btn");

if (profileName) {
    profileName.textContent = ` ${me.login}`;
}

if (profileInitials) {
    const source = (me.name || me.login || "U").trim();
    const parts = source.split(/\s+/).filter(Boolean);

    const initials =
        parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : source.slice(0, 2).toUpperCase();

    profileInitials.textContent = initials;
}

profileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    profileMenu?.classList.toggle("hidden");
});

document.addEventListener("click", () => {
    profileMenu?.classList.add("hidden");
});

profileMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
});

profileGithubBtn?.addEventListener("click", () => {
    window.open(`https://github.com/${me.login}`, "_blank");
});

profileLogoutBtn?.addEventListener("click", doLogout);

const navEditor = document.getElementById("nav-editor");
const navRepos = document.getElementById("nav-repos");
const editorPage = document.getElementById("editor-page");
const reposPage = document.getElementById("repos-page");

function showMainTab(tab) {
    const showRepos = tab === "repos";

    editorPage?.classList.toggle("hidden", showRepos);
    reposPage?.classList.toggle("hidden", !showRepos);

    navEditor?.classList.toggle("active", !showRepos);
    navRepos?.classList.toggle("active", showRepos);

    if (!showRepos) {
        requestAnimationFrame(() => {
            editor.layout();
        });
    }
}

async function loadReposPage() {
    const reposTitle = document.getElementById("repos-title");
    const ul = document.getElementById("repos");

    if (!reposTitle || !ul) return;

    reposTitle.textContent = `${me.login}'s GitHub Repositories`;
    ul.innerHTML = "";

    const res = await fetch(`${API}/api/repos`, {
        credentials: "include",
    });

    if (!res.ok) {
        ul.innerHTML = "<li>Failed to load repositories.</li>";
        throw new Error(await res.text());
    }

    const repos = await res.json();

    repos.forEach((repo) => {
        const li = document.createElement("li");
        li.className = "repo-card";

        const left = document.createElement("div");
        left.className = "repo-card-left";

        const link = document.createElement("a");
        link.href = repo.html_url;
        link.target = "_blank";
        link.className = "repo-link";
        link.textContent = repo.full_name;

        const meta = document.createElement("div");
        meta.className = "repo-meta";
        meta.textContent = repo.private
            ? "Private repository"
            : "Public repository";

        left.appendChild(link);
        left.appendChild(meta);

        const openBtn = document.createElement("button");
        openBtn.className = "repo-open-btn";
        openBtn.textContent = "Open in Editor";

        openBtn.onclick = async () => {
            const openRes = await fetch(`${API}/api/workspace/open`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name: repo.full_name }),
            });

            if (!openRes.ok) {
                const errText = await openRes.text();
                alert("Failed to open repo:\n\n" + errText);
                return;
            }

            window.location.href = `/main.html?repo=${encodeURIComponent(repo.full_name)}`;
        };

        li.appendChild(left);
        li.appendChild(openBtn);
        ul.appendChild(li);
    });
}

navEditor?.addEventListener("click", () => {
    showMainTab("editor");
});

navRepos?.addEventListener("click", async () => {
    showMainTab("repos");
    try {
        await loadReposPage();
    } catch (e) {
        console.error(e);
    }
});

showMainTab("editor");

let callState = {
    audio: false,
    video: false,
};

const chat = initChat({ repo, me });
chat.startChat();

const comments = initComments({
    //initalise comments
    editor,
    me: {
        ...me,
        colour: meColour, //adding colour property
    },
    getYDoc: () => ydoc,
    getYText: () => currentYText,
});

const commentBtn = document.getElementById("floating-comment-btn"); //this is the + comment button

function hideCommentButton() {
    //hide it when text not selected
    if (!commentBtn) return;
    commentBtn.classList.add("hidden");
}
const accessInfo = await loadAccessInfo(repo, fetchJson);

await initTerminal(accessInfo, me, openTerminal);

applyRoleUi(accessInfo, editor);

initAccessPanel(repo, fetchJson);

startAccessPolling(repo, fetchJson, editor, me, openTerminal);

let chatDoc = null;
let chatProvider = null;
let chatMessages = null;
//this is protection for whatever is turned into a string isnt html
function cleanHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderChat() {
    const box = document.getElementById("chat-messages");
    if (!box || !chatMessages) return;

    box.innerHTML = "";

    const msgs = chatMessages.toArray();
    for (const m of msgs) {
        const who = m.user?.name || "User";
        const when = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
        const text = m.text || "";

        const wrap = document.createElement("div");
        wrap.className = "chat-msg";
        wrap.innerHTML = `
      <div class="chat-meta">${cleanHtml(who)} • ${cleanHtml(when)}</div>
      <div class="chat-text">${cleanHtml(text)}</div>
    `;
        box.appendChild(wrap);
    }

    // auto scroll to bottom of the chat box
    box.scrollTop = box.scrollHeight;
}

function showCommentButton(x, y) {
    //move button to screen pos and make it visible
    if (!commentBtn) return;
    commentBtn.style.left = `${x}px`;
    commentBtn.style.top = `${y}px`;
    commentBtn.classList.remove("hidden");
}

function updateCommentButton() {
    if (!commentBtn) return;

    const model = editor.getModel();
    const selection = editor.getSelection();
    const editorEl = editor.getDomNode(); //html element for monaco editor

    if (!model || !selection || !editorEl || selection.isEmpty()) {
        hideCommentButton();
        return;
    }

    const selectedText = model.getValueInRange(selection).trim();
    if (!selectedText) {
        hideCommentButton();
        return;
    }

    const endPos = {
        //want end position as button appears at end of text
        lineNumber: selection.endLineNumber,
        column: selection.endColumn,
    };

    const pos = editor.getScrolledVisiblePosition(endPos); //figure out exactly where code appears in editor so monaco knows where to put button
    if (!pos) {
        hideCommentButton();
        return;
    }

    const editorRect = editorEl.getBoundingClientRect(); //gets shape of the whole editor on the page

    const x = editorRect.left + pos.left + 12; //moves button slightly to right of text
    const y = editorRect.top + pos.top - 8; //slightly upward

    showCommentButton(x, y);
}

editor.onDidChangeCursorSelection(() => {
    //whenever something changes recompute button
    updateCommentButton();
});

editor.onDidScrollChange(() => {
    //update when editor scrolls
    updateCommentButton();
});

window.addEventListener("resize", () => {
    //when browser window resizes
    updateCommentButton();
});

commentBtn?.addEventListener("click", async () => {
    try {
        //try to add comment
        await comments.addComment();
        hideCommentButton();
    } catch (err) {
        console.error(err);
        alert("Failed to add comment: " + err.message);
    }
});

let ydoc = null; //YJS document, shared collab document
let provider = null; //websocket connection
let binding = null; //binding between yjs and monaco
let autosaveTimer = null;
let autosaveDispose = null; // to remove the Monaco listener when switching files

let currentFilePath = null; //tracks what file is currently open
let currentYText = null; //shared text context

let currentModel = null; //monacos editor model
let awarenessUpdateHandler = null;
function cleanupCollab() {
    if (autosaveDispose) {
        autosaveDispose.dispose();
        autosaveDispose = null;
    }
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }

    if (provider && awarenessUpdateHandler) {
        provider.awareness.off("update", awarenessUpdateHandler);
        awarenessUpdateHandler = null;
    }

    if (binding) {
        binding.destroy();
        binding = null;
    }

    if (provider) {
        provider.destroy();
        provider = null;
    }
    if (ydoc) {
        ydoc.destroy();
        ydoc = null;
    }

    if (editor.getModel()) editor.setModel(null);

    if (currentModel) {
        currentModel.dispose();
        currentModel = null;
    }

    currentFilePath = null;
    currentYText = null;
    comments?.refreshForCurrentFile();
    hideCommentButton();
}
async function openFile(filePath) {
    if (!repo) {
        alert("No repo selected. Go back to repos page and click Open in Editor.");
        return;
    }

    cleanupCollab();

    const currentFile = document.getElementById("current-file");
    if (currentFile) currentFile.textContent = `File: ${filePath}`;

    const data = await fetchJson(
        `${API}/api/workspace/file?path=${encodeURIComponent(filePath)}`,
    );

    const room = `${repo}::${filePath}`;

    ydoc = new Y.Doc();
    provider = new WebsocketProvider("ws://localhost:3000", room, ydoc);

    const name = me.name || me.login || "User";
    const colour = meColour;
    provider.awareness.setLocalStateField("user", { name, colour });

    const ytext = ydoc.getText("monaco");

    const lang = languageType(filePath); //getting specifc language for current file
    currentModel = monaco.editor.createModel(data.content || "", lang);

    editor.setModel(currentModel);
    const model = currentModel;

    provider.once("synced", () => {
        if (ytext.length === 0) {
            ytext.insert(0, data.content || "");
        }
    });

    function awarenessStyles() {
        //cursor styles and colours -- NEED TO ADD MORE HERE LATER currently just username and highlighting code, want to add permanent highlights and user history
        let el = document.getElementById("awareness-styles");
        if (!el) {
            el = document.createElement("style");
            el.id = "awareness-styles";
            document.head.appendChild(el);
        }
        return el;
    }

    function updateAwarenessStyles(awareness) {
        const styleEl = awarenessStyles();
        let css = "";

        awareness.getStates().forEach((state, clientId) => {
            const user = state?.user;
            if (!user) return;

            const name = user.name || "User";
            const colour = user.colour || "hsl(200 80% 55%)";

            css += `

.yRemoteSelection-${clientId} {
  background-color: ${colour.replace(/\)$/, " / 0.25)")};

}

.yRemoteSelectionHead-${clientId} {
  border-left: 2px solid ${colour};
  position: relative;
}

.yRemoteSelectionHead-${clientId}::after {
  content: "${name}";
  position: absolute;
  transform: translate(8px, -22px);
  background: ${colour};
  color: white;
  padding: 2px 6px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease-in-out;
  z-index: 10;
}

.monaco-editor:hover .yRemoteSelectionHead-${clientId}:hover::after {
  opacity: 1;
}

`;
        });

        styleEl.textContent = css;
    }

    const awareness = provider.awareness;

    awarenessUpdateHandler = () => updateAwarenessStyles(awareness);
    awareness.on("update", awarenessUpdateHandler);
    updateAwarenessStyles(awareness);

    binding = new MonacoBinding(
        ytext,
        model,
        new Set([editor]), //set as we can have multiple editors in future
        awareness, //users online
    );

    let changed = false;

    let readyForAutosave = false; //prevents autosave before syncing

    // wait until the doc to sync
    provider.once("synced", () => {
        readyForAutosave = true;
    });

    // mark as changed when user makes an edit
    autosaveDispose = editor.onDidChangeModelContent(() => {
        //this is the monaco listener from above where monaco listens for any changes
        if (!readyForAutosave) return;
        changed = true;

        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(async () => {
            //resets timer if user is typing/making changes
            if (!changed) return;
            try {
                await saveCurrentFile(true);
                changed = false;
            } catch (e) {
                console.error(e);
            }
        }, 1500); //1.5 seconds after any changes before autosaving
    });

    currentFilePath = filePath;
    currentYText = ytext;
    comments?.refreshForCurrentFile();
    hideCommentButton();
}

//function to save file
async function saveCurrentFile(silent = false) {
    if (!currentFilePath || !currentYText) {
        if (!silent) alert("Open a file first.");
        return;
    }

    await fetchJson(`${API}/api/workspace/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            path: currentFilePath,
            content: currentYText.toString(),
        }),
    });

    if (!silent) alert("Saved to workspace.");
}

//function to commit file
async function commitChanges(messageFromUi) {
    await saveCurrentFile(true);

    const message = typeof messageFromUi === "string" ? messageFromUi.trim() : "";

    if (!message) {
        alert("Enter a commit message.");
        return;
    }

    await fetchJson(`${API}/api/workspace/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    });

    alert("Committed.");
}

//function to push file changes to github
async function pushChanges() {
    await saveCurrentFile(true);
    await fetchJson(`${API}/api/workspace/push`, { method: "POST" });
    alert("Pushed to GitHub.");
}

gitCommitBtn?.addEventListener("click", () => {
    const message = commitMessageInput?.value || "";
    commitChanges(message)
        .then(() => {
            if (commitMessageInput) commitMessageInput.value = "";
        })
        .catch((e) => alert(e.message));
});

gitPushBtn?.addEventListener("click", () => {
    pushChanges().catch((e) => alert(e.message));
});

const fileTreeEl = document.getElementById("file-tree");

fileTreeEl.addEventListener("click", (e) => {
    if (e.target === fileTreeEl) {
        setSelectedPath(null);
    }
});

// Allow dropping files into root
fileTreeEl.addEventListener("dragover", (e) => {
    e.preventDefault();
});

fileTreeEl.addEventListener("drop", async (e) => {
    e.preventDefault();

    const from = e.dataTransfer.getData("text/plain");
    if (!from) return;

    const name = from.split("/").pop();
    const to = name; // root level

    await fetchJson(`${API}/api/workspace/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
    });

    // Update editor state
    if (currentFilePath === from) currentFilePath = to;
    if (selectedPath === from) selectedPath = to;

    await refreshTree();
});

function buildTreeFromPaths(paths) {
    const root = { name: "", path: "", children: [] };
    const map = new Map();
    map.set("", root);

    for (const full of paths) {
        const isDir = full.endsWith("/");
        const parts = full.replace(/\/$/, "").split("/").filter(Boolean);
        let cur = "";
        let parent = root;

        for (let i = 0; i < parts.length; i++) {
            const name = parts[i];
            const next = cur ? cur + "/" + name : name;
            const isLast = i === parts.length - 1;
            const isFile = isLast && !isDir;

            if (!map.has(next)) {
                const node = { name, path: next, children: isFile ? null : [] };
                map.set(next, node);
                parent.children.push(node);
            }

            parent = map.get(next);
            cur = next;
        }
    }

    return root.children;
}

function renderTree(nodes, parent) {
    const ul = document.createElement("ul");

    for (const n of nodes) {
        const li = document.createElement("li");
        const row = document.createElement("div");
        row.className = "tree-item";
        row.dataset.path = n.path;

        if (n.children) {
            const arrow = document.createElement("span");
            arrow.className = "tree-arrow";
            arrow.textContent = "▶";

            const label = document.createElement("span");
            label.textContent = n.name;

            row.appendChild(arrow);
            row.appendChild(label);
        } else {
            const spacer = document.createElement("span");
            spacer.className = "tree-arrow-spacer";
            spacer.textContent = " ";

            const label = document.createElement("span");
            label.textContent = n.name;

            row.appendChild(spacer);
            row.appendChild(label);
        }

        // allow both files and folders to be draggable
        row.draggable = true;

        row.addEventListener("dragstart", (e) => {
            e.stopPropagation();
            e.dataTransfer.setData("text/plain", n.path);
        });

        // right click menu for both files and folders
        row.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();

            setSelectedPath(n.path);

            if (treeContextMenu) {
                treeContextMenu.style.left = `${e.clientX}px`;
                treeContextMenu.style.top = `${e.clientY}px`;
                treeContextMenu.classList.remove("hidden");
            }
        });

        if (n.children) {
            row.classList.add("folder");
            row.addEventListener("click", (e) => {
                e.stopPropagation();

                setSelectedPath(n.path);

                li.classList.toggle("open");
                const arrow = row.querySelector(".tree-arrow");
                if (arrow) {
                    arrow.classList.toggle("open");
                }

                if (li.childElementCount === 1) renderTree(n.children, li);
                else li.removeChild(li.lastChild);
            });

            // allow dropping into folders
            row.addEventListener("dragover", (e) => {
                e.preventDefault();
                row.classList.add("drag-over");
            });

            row.addEventListener("dragleave", () => {
                row.classList.remove("drag-over");
            });

            row.addEventListener("drop", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                row.classList.remove("drag-over");

                const from = e.dataTransfer.getData("text/plain");
                if (!from) return;

                const name = from.split("/").pop();
                const to = n.path + "/" + name;

                // prevent moving folder into itself or its child
                if (to.startsWith(from + "/")) {
                    alert("Cannot move folder inside itself");
                    return;
                }

                try {
                    await fetchJson(`${API}/api/workspace/move`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ from, to }),
                    });

                    // update open editor path if needed
                    if (currentFilePath === from) currentFilePath = to;

                    // update selected path if needed
                    if (selectedPath === from) selectedPath = to;

                    await refreshTree();
                } catch (e) {
                    alert("Move failed: " + e.message);
                }
            });
        } else {
            // file
            row.addEventListener("click", async () => {
                selectedPath = n.path;
                setSelectedPath(n.path);

                try {
                    await openFile(n.path);
                } catch (e) {
                    console.error(e);
                    alert("Failed to open file: " + e.message); //try catch block to fix a bug
                }
            });
        }

        li.appendChild(row);
        ul.appendChild(li);
    }

    parent.appendChild(ul);
}

let lastTreeSnapshot = "";

async function refreshTree() {
    const paths = await fetchJson(`${API}/api/workspace/tree`);
    const snapshot = JSON.stringify(paths);

    if (snapshot === lastTreeSnapshot) return;

    lastTreeSnapshot = snapshot;
    fileTreeEl.innerHTML = "";
    renderTree(buildTreeFromPaths(paths), fileTreeEl);
}

refreshTree().catch((e) => {
    console.error(e);
    alert(
        "Couldn't load repo files.\n\n" +
        "Make sure you clicked 'Open in Editor' on repos.html first, " +
        "so the server cloned the repo and set it active.\n\n" +
        e.message,
    );
});

setInterval(() => {
    refreshTree().catch((e) => {
        console.error("Tree refresh failed:", e);
    });
}, 2000);

const terminalEl = document.getElementById("terminal");
const hideTerminalBtn = document.getElementById("hide-terminal-btn");
const showTerminalBtn = document.getElementById("show-terminal-btn");

function updateTerminalButtons() {
    const hidden = terminalEl?.hidden ?? true;

    if (showTerminalBtn) {
        showTerminalBtn.classList.toggle("hidden", !hidden);
    }
}

hideTerminalBtn?.addEventListener("click", () => {
    if (!terminalEl) return;
    terminalEl.hidden = true;
    updateTerminalButtons();
});

showTerminalBtn?.addEventListener("click", () => {
    if (!terminalEl) return;
    terminalEl.hidden = false;
    updateTerminalButtons();
});

updateTerminalButtons();

/*
References
https://docs.yjs.dev/api/shared-types/y.text

https://docs.yjs.dev/api/y.doc

https://github.com/yjs/y-websocket

https://docs.yjs.dev/api/about-awareness

https://github.com/yjs/y-monaco

https://github.com/microsoft/monaco-editor

https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch#credentials

https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams


*/

// added features: new file/folder/rename/delete

// stores currently selected path and element for highlight
let selectedPath = null;
let selectedElement = null;

// handles selecting a file or folder and updating highlight
function setSelectedPath(path) {
    // remove highlight from previously selected element
    if (selectedElement) {
        selectedElement.classList.remove("selected");
        selectedElement = null;
    }

    selectedPath = path;

    // clear file label if nothing selected
    if (!path) {
        const currentFile = document.getElementById("current-file");
        if (currentFile) currentFile.textContent = "";
        return;
    }

    // find matching element safely using CSS.escape
    const el = document.querySelector(`[data-path="${CSS.escape(path)}"]`);

    // apply highlight
    if (el) {
        el.classList.add("selected");
        selectedElement = el;
    }

    // update file label
    const currentFile = document.getElementById("current-file");
    if (currentFile) currentFile.textContent = `File: ${path}`;
}

// creates new file or folder inside selected folder if available
async function apiCreate(type) {
    if (!repo) {
        alert("No repo selected. Go back to repos page and click Open in Editor.");
        return;
    }

    // determine base folder
    let base = "";

    if (selectedPath) {
        // check if selectedPath is folder or file
        const el = document.querySelector(
            `[data-path="${CSS.escape(selectedPath)}"]`,
        );

        if (el && el.classList.contains("folder")) {
            base = selectedPath;
        } else {
            // if file selected, use parent folder
            const parts = selectedPath.split("/");
            parts.pop();
            base = parts.join("/");
        }
    }

    const name = prompt(type === "dir" ? "New folder name:" : "New file name:");

    if (!name) return;

    // build full path automatically
    const fullPath = base ? base + "/" + name : name;

    await fetchJson(`${API}/api/workspace/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            path: fullPath,
            type,
        }),
    });

    await refreshTree();

    setSelectedPath(fullPath);

    if (type === "file") await openFile(fullPath);
}

// renames selected file or folder without renaming full path manually
async function apiRename() {
    if (!repo) return;

    const from = selectedPath || currentFilePath;

    if (!from) {
        alert("No file or folder selected");
        return;
    }

    // split path to isolate filename
    const parts = from.split("/");
    const oldName = parts.pop();

    const newName = prompt("Rename:", oldName);

    if (!newName || newName === oldName) return;

    // rebuild path with new name
    const parent = parts.length ? parts.join("/") + "/" : "";
    const to = parent + newName;

    // send move request
    await fetchJson(`${API}/api/workspace/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
    });

    // update open file reference if needed
    if (currentFilePath === from) currentFilePath = to;
    if (selectedPath === from) selectedPath = to;

    await refreshTree();
}

// deletes selected file or folder using backend API
async function apiDelete() {
    if (!repo) {
        alert("No repo selected. Go back to repos page and click Open in Editor.");
        return;
    }

    if (!selectedPath) {
        alert("Select a file or folder first.");
        return;
    }

    // confirm delete
    const ok = confirm(`Delete "${selectedPath}"?`);
    if (!ok) return;

    // close editor if deleting open file
    if (currentFilePath === selectedPath) {
        await saveCurrentFile(true);
    }
    cleanupCollab();

    // send delete request
    await fetchJson(`${API}/api/workspace/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath }),
    });

    // clear selection and refresh tree
    selectedPath = null;
    setSelectedPath(null);

    await refreshTree();
}

// handles selecting items in file list (fallback selection handler)
(function wireFileListSelection() {
    const ul = document.getElementById("file-list");

    if (!ul) return;

    ul.addEventListener("click", (e) => {
        const li = e.target && e.target.closest ? e.target.closest("li") : null;

        if (!li) return;

        const p = li.textContent;

        if (!p) return;

        setSelectedPath(p);

        // visual highlight
        Array.from(ul.querySelectorAll("li")).forEach(
            (x) => (x.style.background = ""),
        );

        li.style.background = "#e9f2ff";
    });
})();

// button event listeners
document.getElementById("new-file-btn")?.addEventListener("click", () => {
    apiCreate("file").catch((e) => alert(e.message));
});

document.getElementById("new-folder-btn")?.addEventListener("click", () => {
    apiCreate("dir").catch((e) => alert(e.message));
});

document.getElementById("rename-btn")?.addEventListener("click", () => {
    apiRename().catch((e) => alert(e.message));
});

document.getElementById("delete-file-btn")?.addEventListener("click", () => {
    apiDelete().catch((e) => alert(e.message));
});

/*
References

https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API

https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector

https://developer.mozilla.org/en-US/docs/Web/API/CSS/escape

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split

https://developer.mozilla.org/en-US/docs/Web/API/Window/confirm

https://nodejs.org/api/fs.html

https://expressjs.com/en/guide/routing.html

https://www.youtube.com/watch?v=OXGznpKZ_sA

https://www.youtube.com/watch?v=3PHXvlpOkf4

https://github.com/yjs/yjs-demos/blob/main/monaco/monaco.js

https://docs.yjs.dev/ecosystem/editor-bindings/monaco

*/

// WebRTC Voice and Video Call code

import { initWebRtc } from "./webrtc.js";

// Call buttons and ui
const startAudioBtn = document.getElementById("start-audio-call-btn");
const startVideoBtn = document.getElementById("start-video-call-btn");

const audioBar = document.getElementById("audio-call-bar");
const videoPanel = document.getElementById("video-call-panel");

const audioStatus = document.getElementById("audio-call-status");
const videoStatus = document.getElementById("video-call-status");
const statusEl = document.getElementById("call-status");

const localVideo = document.getElementById("local-video");
const remoteVideo = document.getElementById("remote-video");

const audioMuteBtn = document.getElementById("audio-mute-btn");
const audioHangupBtn = document.getElementById("audio-hangup-btn");
const videoMuteBtn = document.getElementById("video-mute-btn");
const videoCameraBtn = document.getElementById("video-camera-btn");
const videoHangupBtn = document.getElementById("video-hangup-btn");

// header of the floating video window
const videoHeader = document.getElementById("video-call-header");

function setCallStatus(text) {
    if (statusEl) statusEl.textContent = text;
    if (audioStatus) audioStatus.textContent = text;
    if (videoStatus) videoStatus.textContent = text;
}

function renderCallState({
    roomCall,
    joinedCall,
    currentMode,
    muted,
    cameraEnabled,
}) {
    const hasActiveCall = !!roomCall?.active;
    const activeMode = roomCall?.mode || null;

    const audioAvailable = hasActiveCall && activeMode === "audio" && !joinedCall;
    const videoAvailable = hasActiveCall && activeMode === "video" && !joinedCall;

    const audioActive = joinedCall && currentMode === "audio";
    const videoActive = joinedCall && currentMode === "video";

    // never disable the buttons now
    if (startAudioBtn) startAudioBtn.disabled = false;
    if (startVideoBtn) startVideoBtn.disabled = false;

    // reset classes first
    startAudioBtn?.classList.remove("call-available", "call-active");
    startVideoBtn?.classList.remove("call-available", "call-active");

    // add correct state classes
    startAudioBtn?.classList.toggle("call-available", audioAvailable);
    startAudioBtn?.classList.toggle("call-active", audioActive);

    startVideoBtn?.classList.toggle("call-available", videoAvailable);
    startVideoBtn?.classList.toggle("call-active", videoActive);

    // helpful titles
    if (startAudioBtn) {
        startAudioBtn.title = audioAvailable
            ? "Join Audio Call"
            : audioActive
                ? "Audio Call Active"
                : "Start Audio Call";
    }

    if (startVideoBtn) {
        startVideoBtn.title = videoAvailable
            ? "Join Video Call"
            : videoActive
                ? "Video Call Active"
                : "Start Video Call";
    }

    // Hide both call UIs first
    audioBar?.classList.add("hidden");
    videoPanel?.classList.add("hidden");

    // Show joined call UI
    if (audioActive) {
        audioBar?.classList.remove("hidden");
    }

    if (videoActive) {
        videoPanel?.classList.remove("hidden");
    }

    // Update button labels
    if (audioMuteBtn) audioMuteBtn.textContent = muted ? "Unmute" : "Mute";
    if (videoMuteBtn) videoMuteBtn.textContent = muted ? "Unmute" : "Mute";
    if (videoCameraBtn) {
        videoCameraBtn.textContent = cameraEnabled ? "Camera Off" : "Camera On";
    }

    if (audioAvailable) {
        setCallStatus("Audio call available");
    } else if (videoAvailable) {
        setCallStatus("Video call available");
    } else if (!hasActiveCall) {
        setCallStatus("No active call");
    }
}

const rtc = initWebRtc({
    repo,
    user: me,
    ui: {
        setStatus: setCallStatus,
        setLocalStream(stream) {
            if (localVideo) localVideo.srcObject = stream;
        },
        setRemoteStream(stream) {
            if (remoteVideo) remoteVideo.srcObject = stream;
        },
        renderState: renderCallState,
    },
});

// Button wiring
startAudioBtn?.addEventListener("click", () => {
    const joiningAudio =
        startAudioBtn.classList.contains("call-available") &&
        !startAudioBtn.classList.contains("call-active");

    const action = joiningAudio ? rtc.joinCall() : rtc.startAudioCall();

    action.catch((err) => {
        console.error(err);
        setCallStatus(
            `${joiningAudio ? "Join" : "Audio call"} failed: ${err.message}`,
        );
    });
});

startVideoBtn?.addEventListener("click", () => {
    const joiningVideo =
        startVideoBtn.classList.contains("call-available") &&
        !startVideoBtn.classList.contains("call-active");

    const action = joiningVideo ? rtc.joinCall() : rtc.startVideoCall();

    action.catch((err) => {
        console.error(err);
        setCallStatus(
            `${joiningVideo ? "Join" : "Video call"} failed: ${err.message}`,
        );
    });
});

audioMuteBtn?.addEventListener("click", () => {
    rtc.toggleMute();
});

videoMuteBtn?.addEventListener("click", () => {
    rtc.toggleMute();
});

videoCameraBtn?.addEventListener("click", () => {
    rtc.toggleCamera().catch((err) => {
        console.error(err);
        setCallStatus(`Camera toggle failed: ${err.message}`);
    });
});

audioHangupBtn?.addEventListener("click", () => {
    rtc.hangUp();
});

videoHangupBtn?.addEventListener("click", () => {
    rtc.hangUp();
});

// Make floating video panel draggable
(function makeVideoPanelDraggable() {
    if (!videoPanel || !videoHeader) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    videoHeader.addEventListener("mousedown", (e) => {
        dragging = true;

        const rect = videoPanel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        videoPanel.style.left = `${rect.left}px`;
        videoPanel.style.top = `${rect.top}px`;
        videoPanel.style.right = "auto";
        videoPanel.style.bottom = "auto";
    });

    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;

        videoPanel.style.left = `${startLeft + (e.clientX - startX)}px`;
        videoPanel.style.top = `${startTop + (e.clientY - startY)}px`;
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });
})();

/*
References

https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API

https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection

https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling

https://webrtc.org/getting-started/turn-server

https://webrtc.org/getting-started/overview

https://webrtc.github.io/samples/

https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols

*/
