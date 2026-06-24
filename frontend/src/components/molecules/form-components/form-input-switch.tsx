import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Control } from 'react-hook-form'; // Import Control type

type IInpuItemProps = {
  name: string;
  placeholder?: string;
  control: Control<any>; // Add control prop of type Control
  label?: string;
  value?: string | number;
  formStyle?: string;
  formLabelStyle?: string;
  formControlStyle?: string;
  formMessageStyle?: string;
  defaultValue?: string | number;
  disabled?: boolean;
  description?: string;
  isFormDescription?: boolean;
};

export const SwitchInput = ({
  control,
  label,
  description,
  name,
  isFormDescription = true,
  formStyle,
}: IInpuItemProps) => {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={`flex flex-row items-center justify-between gap-4 rounded-lg border p-4 ${formStyle}`}
        >
          <div className="space-y-0.5 min-w-0">
            <FormLabel className="text-base break-words">{label}</FormLabel>
            {isFormDescription && (
              <FormDescription className="break-words">{description}</FormDescription>
            )}
          </div>
          <FormControl className="flex-shrink-0">
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
};
