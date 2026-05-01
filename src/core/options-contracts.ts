export type GateOptionsTextField = {
  type: "text" | "password";
  id: string;
  label: string;
  placeholder?: string;
  autocomplete?: string;
  hint?: string;
};

export type GateOptionsRangeField = {
  type: "range";
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: string;
  labelId: string;
};

export type GateOptionsProvider = {
  id: string;
  label: string;
  description: string;
  hint?: string;
  fields?: GateOptionsTextField[];
};

export type GateOptionsProviderGroup = {
  legend: string;
  inputName: string;
  providers: GateOptionsProvider[];
};

export type GateOptionsDefinition = {
  cardDescription: string;
  detailsSummary: string;
  notes?: string[];
  providerGroup?: GateOptionsProviderGroup;
  rangeFields?: GateOptionsRangeField[];
  statusId?: string;
};
