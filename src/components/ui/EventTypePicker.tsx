'use client';

import { CULTURAL_EVENT_TYPES, GENERAL_EVENT_TYPES, type EventTypeId } from '@/types';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from '@/components/ui/select';

interface EventTypePickerProps {
  value?: EventTypeId;
  onValueChange: (id: EventTypeId) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function EventTypePicker({
  value,
  onValueChange,
  placeholder = 'Select event type',
  disabled,
  className,
}: EventTypePickerProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as EventTypeId)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {CULTURAL_EVENT_TYPES.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Other celebrations</SelectLabel>
          {GENERAL_EVENT_TYPES.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
