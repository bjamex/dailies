// Dailies note editor — TipTap (WYSIWYG) with Markdown storage.
// Bundled by esbuild into static/vendor/editor.bundle.js as window.NoteEditor.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';

// Toolbar button definitions. Each: label, title, active(editor), run(editor).
function toolbarButtons() {
  return [
    { label: 'H1', title: 'Heading 1', active: e => e.isActive('heading', { level: 1 }), run: e => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: 'H2', title: 'Heading 2', active: e => e.isActive('heading', { level: 2 }), run: e => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'H3', title: 'Heading 3', active: e => e.isActive('heading', { level: 3 }), run: e => e.chain().focus().toggleHeading({ level: 3 }).run() },
    { sep: true },
    { label: 'B', cls: 'b', title: 'Bold (Ctrl+B)', active: e => e.isActive('bold'), run: e => e.chain().focus().toggleBold().run() },
    { label: 'I', cls: 'i', title: 'Italic (Ctrl+I)', active: e => e.isActive('italic'), run: e => e.chain().focus().toggleItalic().run() },
    { label: 'S', cls: 's', title: 'Strikethrough', active: e => e.isActive('strike'), run: e => e.chain().focus().toggleStrike().run() },
    { label: '&lt;/&gt;', title: 'Inline code', active: e => e.isActive('code'), run: e => e.chain().focus().toggleCode().run() },
    { sep: true },
    { label: '•', title: 'Bullet list', active: e => e.isActive('bulletList'), run: e => e.chain().focus().toggleBulletList().run() },
    { label: '1.', title: 'Numbered list', active: e => e.isActive('orderedList'), run: e => e.chain().focus().toggleOrderedList().run() },
    { label: '☑', title: 'Checklist', active: e => e.isActive('taskList'), run: e => e.chain().focus().toggleTaskList().run() },
    { sep: true },
    { label: '❝', title: 'Quote', active: e => e.isActive('blockquote'), run: e => e.chain().focus().toggleBlockquote().run() },
    { label: '{ }', title: 'Code block', active: e => e.isActive('codeBlock'), run: e => e.chain().focus().toggleCodeBlock().run() },
    { label: '—', title: 'Divider', active: () => false, run: e => e.chain().focus().setHorizontalRule().run() },
    { label: '🔗', title: 'Link', active: e => e.isActive('link'), run: e => setLink(e) },
  ];
}

function setLink(editor) {
  const prev = editor.getAttributes('link').href;
  const url = window.prompt('Link URL', prev || 'https://');
  if (url === null) return;
  if (url.trim() === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
}

function buildToolbar(toolbarEl, editor) {
  toolbarEl.innerHTML = '';
  const buttons = [];
  for (const def of toolbarButtons()) {
    if (def.sep) {
      const s = document.createElement('span');
      s.className = 'note-tb-sep';
      toolbarEl.appendChild(s);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'note-tb-btn' + (def.cls ? ' note-tb-' + def.cls : '');
    b.title = def.title;
    b.innerHTML = def.label;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
    b.addEventListener('click', () => def.run(editor));
    toolbarEl.appendChild(b);
    buttons.push({ el: b, active: def.active });
  }
  const sync = () => buttons.forEach(({ el, active }) => el.classList.toggle('active', !!active(editor)));
  return sync;
}

export function create({ element, toolbar, content = '', placeholder = 'Start writing…', onChange }) {
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: true, transformPastedText: true, transformCopiedText: true }),
    ],
    content,
    editorProps: { attributes: { class: 'note-prose' } },
  });

  let sync = () => {};
  if (toolbar) sync = buildToolbar(toolbar, editor);

  const getMarkdown = () => editor.storage.markdown.getMarkdown();

  editor.on('transaction', sync);
  editor.on('update', () => { if (onChange) onChange(getMarkdown()); });
  sync();

  return {
    editor,
    getMarkdown,
    focus: () => editor.commands.focus(),
    destroy: () => editor.destroy(),
  };
}
