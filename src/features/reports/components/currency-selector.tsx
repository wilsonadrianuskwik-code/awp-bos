import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CurrencySelectorProps = {
  currencies: string[];
  value: string;
  onChange: (currency: string) => void;
};

export function CurrencySelector({
  currencies,
  value,
  onChange,
}: CurrencySelectorProps) {
  // A workspace transacting in only one currency (the common case)
  // shouldn't be asked an unnecessary question — the control only
  // renders once there's an actual choice to make.
  if (currencies.length <= 1) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {currencies.map((currency) => (
          <SelectItem key={currency} value={currency}>
            {currency}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
