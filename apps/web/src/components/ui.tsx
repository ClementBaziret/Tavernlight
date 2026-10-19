import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Checkbox as AriaCheckbox,
  Dialog,
  FieldError,
  Heading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  NumberField as AriaNumberField,
  Popover,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Select as AriaSelect,
  SelectValue,
  Switch as AriaSwitch,
  Tab,
  TabList,
  TabPanel,
  Tabs as AriaTabs,
  Text,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  Group,
  type ButtonProps as AriaButtonProps,
  type Key,
} from "react-aria-components";
import { Check, ChevronDown, Loader2, Minus, Plus, X } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// --- Buttons ------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-text hover:opacity-90 border border-brand",
  accent: "bg-lantern text-[#1d1b16] hover:brightness-95 border border-[#8a5a00]",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "bg-transparent text-text border border-transparent hover:bg-surface-2",
  danger: "bg-danger text-white border border-danger hover:opacity-90 dark:text-[#11131f]",
};

export const buttonClass = (variant: Variant = "secondary", size: "sm" | "md" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition select-none",
    "disabled:opacity-50 disabled:cursor-not-allowed data-[disabled]:opacity-50",
    size === "sm" ? "min-h-9 px-2.5 text-sm" : "min-h-11 px-4",
    VARIANTS[variant],
  );

export interface ButtonProps extends AriaButtonProps {
  variant?: Variant;
  size?: "sm" | "md";
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", loading, className, children, isDisabled, ...props }: ButtonProps) {
  return (
    <AriaButton {...props} isDisabled={isDisabled || loading} className={cx(buttonClass(variant, size), className)}>
      {loading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {children}
    </AriaButton>
  );
}

export function IconButton({ label, children, variant = "ghost", size = "md", className, ...props }: ButtonProps & { label: string }) {
  return (
    <AriaButton {...props} aria-label={label} className={cx(buttonClass(variant, size), size === "sm" ? "w-9 px-0" : "w-11 px-0", className)}>
      {children}
    </AriaButton>
  );
}

// --- Fields -----------------------------------------------------------------------

const fieldClass = "w-full rounded-lg border border-border bg-surface px-3 min-h-11 text-text placeholder:text-muted data-[invalid]:border-danger";

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  description?: string;
  error?: string | null;
  isRequired?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  autoFocus?: boolean;
  name?: string;
  inputClassName?: string;
  hideLabel?: boolean;
}) {
  return (
    <AriaTextField
      value={props.value}
      onChange={props.onChange}
      type={props.type}
      isRequired={props.isRequired}
      isInvalid={!!props.error}
      autoComplete={props.autoComplete}
      autoFocus={props.autoFocus}
      name={props.name}
      className={cx("flex flex-col gap-1", props.className)}
    >
      <Label className={cx("text-sm font-medium", props.hideLabel && "sr-only")}>
        {props.label}
        {props.isRequired && <span aria-hidden> *</span>}
      </Label>
      <Input className={cx(fieldClass, props.inputClassName)} placeholder={props.placeholder} />
      {props.description && (
        <Text slot="description" className="text-sm text-muted">
          {props.description}
        </Text>
      )}
      <FieldError className="text-sm text-danger">{props.error}</FieldError>
    </AriaTextField>
  );
}

export function TextArea(props: { label: string; value: string; onChange: (v: string) => void; rows?: number; description?: string; className?: string; hideLabel?: boolean }) {
  return (
    <AriaTextField value={props.value} onChange={props.onChange} className={cx("flex flex-col gap-1", props.className)}>
      <Label className={cx("text-sm font-medium", props.hideLabel && "sr-only")}>{props.label}</Label>
      <AriaTextArea rows={props.rows ?? 4} className={cx(fieldClass, "py-2")} />
      {props.description && (
        <Text slot="description" className="text-sm text-muted">
          {props.description}
        </Text>
      )}
    </AriaTextField>
  );
}

export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  minValue?: number;
  maxValue?: number;
  step?: number;
  description?: string;
  className?: string;
  hideLabel?: boolean;
  formatOptions?: Intl.NumberFormatOptions;
}) {
  return (
    <AriaNumberField
      value={props.value}
      onChange={(v) => props.onChange(Number.isNaN(v) ? (props.minValue ?? 0) : v)}
      minValue={props.minValue}
      maxValue={props.maxValue}
      step={props.step}
      formatOptions={props.formatOptions}
      className={cx("flex flex-col gap-1", props.className)}
    >
      <Label className={cx("text-sm font-medium", props.hideLabel && "sr-only")}>{props.label}</Label>
      <Group className="flex items-stretch overflow-hidden rounded-lg border border-border bg-surface">
        <AriaButton slot="decrement" className="w-10 min-h-11 hover:bg-surface-2 border-r border-line inline-flex items-center justify-center">
          <Minus aria-hidden className="h-4 w-4" />
        </AriaButton>
        <Input className="w-full min-w-0 bg-transparent px-2 text-center tabular-nums" />
        <AriaButton slot="increment" className="w-10 min-h-11 hover:bg-surface-2 border-l border-line inline-flex items-center justify-center">
          <Plus aria-hidden className="h-4 w-4" />
        </AriaButton>
      </Group>
      {props.description && (
        <Text slot="description" className="text-sm text-muted">
          {props.description}
        </Text>
      )}
    </AriaNumberField>
  );
}

export interface Option {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Select(props: {
  label: string;
  options: Option[];
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  description?: string;
  hideLabel?: boolean;
  error?: string | null;
}) {
  return (
    <AriaSelect
      selectedKey={props.value}
      onSelectionChange={(k: Key | null) => k !== null && props.onChange(String(k))}
      placeholder={props.placeholder ?? "—"}
      isInvalid={!!props.error}
      disabledKeys={props.options.filter((o) => o.disabled).map((o) => o.id)}
      className={cx("flex flex-col gap-1", props.className)}
    >
      <Label className={cx("text-sm font-medium", props.hideLabel && "sr-only")}>{props.label}</Label>
      <AriaButton className={cx(fieldClass, "flex items-center justify-between gap-2 text-left")}>
        <SelectValue className="truncate data-[placeholder]:text-muted" />
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0" />
      </AriaButton>
      {props.description && (
        <Text slot="description" className="text-sm text-muted">
          {props.description}
        </Text>
      )}
      <FieldError className="text-sm text-danger">{props.error}</FieldError>
      <Popover className="max-h-80 min-w-[--trigger-width] overflow-auto rounded-lg border border-border bg-surface shadow-xl">
        <ListBox className="p-1 outline-none">
          {props.options.map((o) => (
            <ListBoxItem
              key={o.id}
              id={o.id}
              textValue={o.label}
              className="flex cursor-default flex-col rounded-md px-3 py-2 outline-none data-[focused]:bg-surface-2 data-[selected]:font-semibold data-[disabled]:opacity-50"
            >
              <Text slot="label">{o.label}</Text>
              {o.description && (
                <Text slot="description" className="text-sm text-muted">
                  {o.description}
                </Text>
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}

export function Checkbox(props: { children: ReactNode; isSelected: boolean; onChange: (v: boolean) => void; isDisabled?: boolean; className?: string; "aria-label"?: string }) {
  return (
    <AriaCheckbox
      isSelected={props.isSelected}
      onChange={props.onChange}
      isDisabled={props.isDisabled}
      aria-label={props["aria-label"]}
      className={cx("group flex min-h-11 cursor-pointer items-center gap-2 data-[disabled]:opacity-50", props.className)}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-border bg-surface group-data-[selected]:border-brand group-data-[selected]:bg-brand group-data-[focus-visible]:outline group-data-[focus-visible]:outline-3 group-data-[focus-visible]:outline-offset-2">
        <Check aria-hidden className="hidden h-4 w-4 text-brand-text group-data-[selected]:block" />
      </span>
      {props.children}
    </AriaCheckbox>
  );
}

export function Switch(props: { children: ReactNode; isSelected: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <AriaSwitch isSelected={props.isSelected} onChange={props.onChange} className={cx("group flex min-h-11 cursor-pointer items-center gap-3", props.className)}>
      <span className="flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-border bg-surface-2 px-0.5 transition group-data-[selected]:border-brand group-data-[selected]:bg-brand group-data-[focus-visible]:outline group-data-[focus-visible]:outline-3 group-data-[focus-visible]:outline-offset-2">
        <span className="h-4 w-4 rounded-full bg-text transition group-data-[selected]:translate-x-5 group-data-[selected]:bg-brand-text" />
      </span>
      {props.children}
    </AriaSwitch>
  );
}

export function RadioGroup(props: { label: string; value: string; onChange: (v: string) => void; options: Option[]; orientation?: "horizontal" | "vertical"; className?: string }) {
  return (
    <AriaRadioGroup value={props.value} onChange={props.onChange} orientation={props.orientation ?? "vertical"} className={cx("flex flex-col gap-2", props.className)}>
      <Label className="text-sm font-medium">{props.label}</Label>
      <div className={cx("flex gap-2", props.orientation === "horizontal" ? "flex-row flex-wrap" : "flex-col")}>
        {props.options.map((o) => (
          <AriaRadio
            key={o.id}
            value={o.id}
            isDisabled={o.disabled}
            className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2 data-[selected]:border-brand data-[selected]:bg-accent-soft data-[disabled]:opacity-50"
          >
            <span className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 border-border group-data-[selected]:border-[5px] group-data-[selected]:border-brand" />
            <span className="flex flex-col">
              <span className="font-medium">{o.label}</span>
              {o.description && <span className="text-sm text-muted">{o.description}</span>}
            </span>
          </AriaRadio>
        ))}
      </div>
    </AriaRadioGroup>
  );
}

// --- Dialogs ------------------------------------------------------------------------

export function ModalDialog(props: { isOpen: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode; size?: "md" | "lg" | "xl"; isDismissable?: boolean }) {
  const width = props.size === "xl" ? "max-w-5xl" : props.size === "lg" ? "max-w-3xl" : "max-w-lg";
  return (
    <ModalOverlay isOpen={props.isOpen} onOpenChange={props.onOpenChange} isDismissable={props.isDismissable ?? true} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Modal className={cx("max-h-[90vh] w-full overflow-auto rounded-xl border border-border bg-surface shadow-2xl", width)}>
        <Dialog className="relative p-5 outline-none">
          {({ close }) => (
            <>
              <div className="mb-4 flex items-start justify-between gap-4">
                <Heading slot="title" className="font-display text-xl font-semibold">
                  {props.title}
                </Heading>
                <IconButton label="Close" onPress={close} size="sm">
                  <X aria-hidden className="h-5 w-5" />
                </IconButton>
              </div>
              {props.children}
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

// --- Tabs ---------------------------------------------------------------------------

export function Tabs(props: { label: string; tabs: { id: string; label: string; content: ReactNode }[]; selected?: string; onSelect?: (id: string) => void; className?: string }) {
  return (
    <AriaTabs selectedKey={props.selected} onSelectionChange={(k) => props.onSelect?.(String(k))} className={cx("flex flex-col", props.className)}>
      <TabList aria-label={props.label} className="flex flex-wrap gap-1 border-b border-line">
        {props.tabs.map((t) => (
          <Tab
            key={t.id}
            id={t.id}
            className="-mb-px cursor-pointer rounded-t-lg border border-transparent px-4 py-2.5 font-medium text-muted outline-none data-[selected]:border-line data-[selected]:border-b-surface data-[selected]:bg-surface data-[selected]:text-text data-[hovered]:text-text data-[focus-visible]:outline-3"
          >
            {t.label}
          </Tab>
        ))}
      </TabList>
      {props.tabs.map((t) => (
        <TabPanel key={t.id} id={t.id} className="pt-4 outline-none">
          {t.content}
        </TabPanel>
      ))}
    </AriaTabs>
  );
}

// --- Display ------------------------------------------------------------------------

export function Card({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li"; "aria-labelledby"?: string }) {
  return (
    <As {...rest} className={cx("rounded-xl border border-line bg-surface p-4 shadow-sm", className)}>
      {children}
    </As>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "danger" | "success" | "info" | "accent"; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-text border-line",
    danger: "bg-danger-soft text-danger border-danger",
    success: "bg-success-soft text-success border-success",
    info: "bg-info-soft text-info border-info",
    accent: "bg-accent-soft text-accent border-accent",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function Alert({ children, tone = "info", title }: { children: ReactNode; tone?: "info" | "danger" | "success" | "warning"; title?: string }) {
  const tones = {
    info: "border-info bg-info-soft",
    danger: "border-danger bg-danger-soft",
    success: "border-success bg-success-soft",
    warning: "border-accent bg-accent-soft",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border-l-4 px-4 py-3", tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-4 text-muted">
      <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/** Hit points meter: text is always present, color is never the only cue. */
export function HpBar({ hp, max, temp = 0, label }: { hp: number; max: number; temp?: number; label: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const state = hp <= 0 ? "down" : ratio <= 0.25 ? "critical" : ratio <= 0.5 ? "bloodied" : "ok";
  const color = state === "ok" ? "bg-success" : state === "bloodied" ? "bg-lantern" : "bg-danger";
  return (
    <div className="flex flex-col gap-1">
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} aria-valuetext={`${hp} of ${max} hit points${temp ? `, ${temp} temporary` : ""}`} className="h-2.5 w-full overflow-hidden rounded-full border border-border bg-surface-2">
        <div className={cx("h-full", color)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
