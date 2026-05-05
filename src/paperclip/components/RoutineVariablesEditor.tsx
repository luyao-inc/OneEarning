import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { syncRoutineVariablesWithTemplate, type RoutineVariable } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const variableTypes: RoutineVariable["type"][] = ["text", "textarea", "number", "boolean", "select"];

function serializeVariables(value: RoutineVariable[]) {
  return JSON.stringify(value);
}

function parseSelectOptions(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updateVariableList(
  variables: RoutineVariable[],
  name: string,
  mutate: (variable: RoutineVariable) => RoutineVariable,
) {
  return variables.map((variable) => (variable.name === name ? mutate(variable) : variable));
}

export function RoutineVariablesEditor({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: RoutineVariable[];
  onChange: (value: RoutineVariable[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const syncedVariables = useMemo(
    () => syncRoutineVariablesWithTemplate([title, description], value),
    [description, title, value],
  );
  const syncedSignature = serializeVariables(syncedVariables);
  const currentSignature = serializeVariables(value);

  useEffect(() => {
    if (syncedSignature !== currentSignature) {
      onChange(syncedVariables);
    }
  }, [currentSignature, onChange, syncedSignature, syncedVariables]);

  if (syncedVariables.length === 0) {
    return null;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-lg border border-border/70">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
        <div>
          <p className="text-sm font-medium">{t("paperclip.routinesPage.detail.variablesSectionTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("paperclip.routinesPage.detail.variablesDetectedHint", { syntax: "{{name}}" })}
          </p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border/70 border-t border-border/70">
        {syncedVariables.map((variable) => (
          <div key={variable.name} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {`{{${variable.name}}}`}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t("paperclip.routinesPage.detail.variablesPromptBeforeRun")}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("paperclip.routinesPage.detail.variablesFieldLabel")}</Label>
                <Input
                  value={variable.label ?? ""}
                  onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                    ...current,
                    label: event.target.value || null,
                  })))}
                  placeholder={variable.name.replaceAll("_", " ")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("paperclip.routinesPage.detail.variablesFieldType")}</Label>
                <Select
                  value={variable.type}
                  onValueChange={(type) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                    ...current,
                    type: type as RoutineVariable["type"],
                    defaultValue: type === "boolean" ? null : current.defaultValue,
                    options: type === "select" ? current.options : [],
                  })))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variableTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`paperclip.routinesPage.detail.variablesType_${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs">{t("paperclip.routinesPage.detail.variablesFieldDefaultValue")}</Label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={variable.required}
                      onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                        ...current,
                        required: event.target.checked,
                      })))}
                    />
                    {t("paperclip.routinesPage.detail.variablesRequired")}
                  </label>
                </div>

                {variable.type === "textarea" ? (
                  <Textarea
                    rows={3}
                    value={variable.defaultValue == null ? "" : String(variable.defaultValue)}
                    onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: event.target.value || null,
                    })))}
                  />
                ) : variable.type === "boolean" ? (
                  <Select
                    value={variable.defaultValue === true ? "true" : variable.defaultValue === false ? "false" : "__unset__"}
                    onValueChange={(next) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: next === "__unset__" ? null : next === "true",
                    })))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">{t("paperclip.routinesPage.detail.variablesNoDefault")}</SelectItem>
                      <SelectItem value="true">{t("paperclip.routinesPage.detail.variablesTrue")}</SelectItem>
                      <SelectItem value="false">{t("paperclip.routinesPage.detail.variablesFalse")}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : variable.type === "select" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("paperclip.routinesPage.detail.variablesFieldOptions")}</Label>
                      <Input
                        value={variable.options.join(", ")}
                        onChange={(event) => {
                          const options = parseSelectOptions(event.target.value);
                          onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                            ...current,
                            options,
                            defaultValue:
                              typeof current.defaultValue === "string" && options.includes(current.defaultValue)
                                ? current.defaultValue
                                : null,
                          })));
                        }}
                        placeholder={t("paperclip.routinesPage.detail.variablesOptionsPlaceholder")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("paperclip.routinesPage.detail.variablesFieldDefaultOption")}</Label>
                      <Select
                        value={typeof variable.defaultValue === "string" ? variable.defaultValue : "__unset__"}
                        onValueChange={(next) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                          ...current,
                          defaultValue: next === "__unset__" ? null : next,
                        })))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("paperclip.routinesPage.detail.variablesNoDefault")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unset__">{t("paperclip.routinesPage.detail.variablesNoDefault")}</SelectItem>
                          {variable.options.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <Input
                    type={variable.type === "number" ? "number" : "text"}
                    value={variable.defaultValue == null ? "" : String(variable.defaultValue)}
                    onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: event.target.value || null,
                    })))}
                    placeholder={
                      variable.type === "number"
                        ? t("paperclip.routinesPage.detail.variablesNumberPlaceholder")
                        : t("paperclip.routinesPage.detail.variablesDefaultValuePlaceholder")
                    }
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

const BUILTIN_VARIABLE_NAMES = ["date", "timestamp"] as const;

export function RoutineVariablesHint() {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {t("paperclip.routinesPage.detail.variablesHintBar", { syntax: "{{variable_name}}" })}
        </span>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("paperclip.routinesPage.detail.variablesHelpAria")}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("paperclip.routinesPage.detail.variablesDialogTitle")}</DialogTitle>
            <DialogDescription>{t("paperclip.routinesPage.detail.variablesDialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("paperclip.routinesPage.detail.variablesCustomSectionTitle")}
              </h3>
              <p className="text-muted-foreground">
                {t("paperclip.routinesPage.detail.variablesCustomIntro", {
                  syntax: "{{variable_name}}",
                  variablesWord: t("paperclip.routinesPage.detail.variablesWord"),
                })}
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("paperclip.routinesPage.detail.variablesCustomBullet1")}</li>
                <li>{t("paperclip.routinesPage.detail.variablesCustomBullet2")}</li>
                <li>{t("paperclip.routinesPage.detail.variablesCustomBullet3")}</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("paperclip.routinesPage.detail.variablesBuiltinSectionTitle")}
              </h3>
              <p className="text-muted-foreground">{t("paperclip.routinesPage.detail.variablesBuiltinIntro")}</p>
              <div className="overflow-hidden rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">
                        {t("paperclip.routinesPage.detail.variablesTablePlaceholder")}
                      </th>
                      <th className="px-3 py-2 font-medium">{t("paperclip.routinesPage.detail.variablesTableExample")}</th>
                      <th className="px-3 py-2 font-medium">
                        {t("paperclip.routinesPage.detail.variablesTableDescription")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {BUILTIN_VARIABLE_NAMES.map((name) => (
                      <tr key={name} className="align-top">
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="font-mono text-xs">{`{{${name}}}`}</Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {t(`paperclip.routinesPage.detail.builtinVariables.${name}.example`)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {t(`paperclip.routinesPage.detail.builtinVariables.${name}.description`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
