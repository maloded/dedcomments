import { Button } from "@/shared/ui/Button";
import cls from "./TagToolbar.module.scss";

export type WrapTag = "i" | "strong" | "code";

interface TagToolbarProps {
  onWrap: (tag: WrapTag) => void;
  onInsertLink: () => void;
  disabled?: boolean;
}

const WRAP_BUTTONS: { tag: WrapTag; label: string; title: string }[] = [
  { tag: "i", label: "i", title: "Italic — <i>" },
  { tag: "strong", label: "B", title: "Bold — <strong>" },
  { tag: "code", label: "<>", title: "Code — <code>" },
];

/**
 * Toolbar of buttons for the four HTML tags the backend accepts (brief §JS/AJAX
 * item 3). Wraps the textarea's current selection, or inserts at the cursor if
 * nothing is selected — the actual DOM manipulation lives in `CommentForm`
 * (it owns the textarea ref); this component is purely presentational.
 */
export function TagToolbar(props: TagToolbarProps) {
  const { onWrap, onInsertLink, disabled } = props;

  return (
    <div className={cls.TagToolbar} role="toolbar" aria-label="Formatting">
      {WRAP_BUTTONS.map(({ tag, label, title }) => (
        <Button
          key={tag}
          type="button"
          size="sm"
          variant="outline"
          className={cls.btn}
          disabled={disabled}
          title={title}
          onClick={() => onWrap(tag)}
        >
          {label}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cls.btn}
        disabled={disabled}
        title='Link — <a href="" title="">'
        onClick={onInsertLink}
      >
        Link
      </Button>
    </div>
  );
}
