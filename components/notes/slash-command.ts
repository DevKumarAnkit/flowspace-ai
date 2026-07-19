import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";

type SlashItem = {
  title: string;
  hint: string;
  keywords: string;
  run: (editor: Editor) => void;
};

const ITEMS: SlashItem[] = [
  { title: "Text", hint: "Plain paragraph", keywords: "paragraph text", run: (editor) => editor.chain().focus().setParagraph().run() },
  { title: "Heading 1", hint: "Large heading", keywords: "h1 title", run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: "Heading 2", hint: "Medium heading", keywords: "h2 subtitle", run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: "Heading 3", hint: "Small heading", keywords: "h3 subtitle", run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: "Bullet List", hint: "Simple bulleted list", keywords: "unordered bullets", run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { title: "Numbered List", hint: "Ordered list", keywords: "ordered numbers", run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { title: "To-do List", hint: "Checklist with tasks", keywords: "task checkbox todo", run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { title: "Quote", hint: "Capture a quotation", keywords: "blockquote", run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { title: "Code Block", hint: "Code with monospace styling", keywords: "code pre", run: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { title: "Divider", hint: "Separate sections", keywords: "horizontal rule line", run: (editor) => editor.chain().focus().setHorizontalRule().run() },
];

function execute(editor: Editor, range: Range, item: SlashItem) {
  editor.chain().focus().deleteRange(range).run();
  item.run(editor);
}

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [Suggestion<SlashItem>({
      editor: this.editor,
      char: "/",
      allowSpaces: false,
      startOfLine: false,
      items: ({ query }) => {
        const normalized = query.toLowerCase();
        return ITEMS.filter((item) => `${item.title} ${item.keywords}`.toLowerCase().includes(normalized)).slice(0, 10);
      },
      command: ({ editor, range, props }) => execute(editor, range, props),
      render: () => {
        let element: HTMLDivElement | null = null;
        let unmount: (() => void) | undefined;
        let activeIndex = 0;
        let current: SuggestionProps<SlashItem> | null = null;

        const draw = () => {
          if (!element || !current) return;
          element.replaceChildren();
          element.setAttribute("aria-label", "Insert block");
          if (!current.items.length) {
            const empty = document.createElement("div");
            empty.className = "slash-empty";
            empty.textContent = "No matching blocks";
            element.append(empty);
            return;
          }
          current.items.forEach((item, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = index === activeIndex ? "slash-item active" : "slash-item";
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", String(index === activeIndex));
            const title = document.createElement("strong");
            title.textContent = item.title;
            const hint = document.createElement("span");
            hint.textContent = item.hint;
            button.append(title, hint);
            button.addEventListener("mousedown", (event) => {
              event.preventDefault();
              current?.command(item);
            });
            element?.append(button);
          });
        };

        return {
          onStart(props) {
            current = props;
            activeIndex = 0;
            element = document.createElement("div");
            element.className = "slash-menu";
            element.setAttribute("role", "listbox");
            draw();
            unmount = props.mount(element, { autoUpdate: { animationFrame: false } });
          },
          onUpdate(props) {
            current = props;
            activeIndex = Math.min(activeIndex, Math.max(0, props.items.length - 1));
            draw();
          },
          onKeyDown({ event }: SuggestionKeyDownProps) {
            if (!current?.items.length) return false;
            if (event.key === "ArrowDown") {
              activeIndex = (activeIndex + 1) % current.items.length;
              draw();
              return true;
            }
            if (event.key === "ArrowUp") {
              activeIndex = (activeIndex - 1 + current.items.length) % current.items.length;
              draw();
              return true;
            }
            if (event.key === "Enter") {
              current.command(current.items[activeIndex]);
              return true;
            }
            return false;
          },
          onExit() {
            unmount?.();
            element = null;
            current = null;
          },
        };
      },
    })];
  },
});
