import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap',
    'font-sans font-medium rounded-md',
    'transition-all duration-[220ms] ease-[cubic-bezier(.22,1,.36,1)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
    'disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed',
    'motion-reduce:transition-none motion-reduce:hover:transform-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-ink text-cream hover:bg-[#2A1E1E] hover:-translate-y-[3px] hover:shadow-[0_8px_20px_rgba(27,20,20,0.25),0_3px_6px_rgba(27,20,20,0.12)]',
        secondary:
          'bg-transparent text-ink border border-ink hover:bg-cream-soft hover:-translate-y-[3px] hover:shadow-[0_6px_14px_rgba(27,20,20,0.10),0_2px_4px_rgba(27,20,20,0.05)]',
        tertiary: 'bg-transparent text-ink hover:bg-cream-soft',
        link: 'bg-transparent text-ink !h-auto !p-0 hover:underline hover:underline-offset-4 hover:decoration-1',
        destructive:
          'bg-error text-cream hover:bg-[#94121F] hover:-translate-y-[3px] hover:shadow-[0_8px_20px_rgba(184,22,40,0.30),0_3px_6px_rgba(184,22,40,0.15)] focus-visible:ring-error',
      },
      size: {
        sm: 'h-8 px-3.5 text-xs gap-1',
        md: 'h-10 px-5 text-[13px] gap-1.5',
        lg: 'h-12 px-6 text-sm gap-2',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonVariantNative = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
type ButtonSizeNative = NonNullable<VariantProps<typeof buttonVariants>['size']>;
type ButtonVariantAlias = 'default' | 'outline' | 'ghost';
type ButtonSizeAlias = 'default' | 'icon';

const VARIANT_ALIASES: Record<ButtonVariantAlias, ButtonVariantNative> = {
  default: 'primary',
  outline: 'secondary',
  ghost: 'tertiary',
};

const SIZE_ALIASES: Record<ButtonSizeAlias, ButtonSizeNative> = {
  default: 'md',
  icon: 'md',
};

export interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  variant?: ButtonVariantNative | ButtonVariantAlias;
  size?: ButtonSizeNative | ButtonSizeAlias;
  asChild?: boolean;
  isLoading?: boolean;
  showTextWhileLoading?: boolean;
  iconLeading?: React.ComponentType<{ className?: string }> | React.ReactNode;
  iconTrailing?: React.ComponentType<{ className?: string }> | React.ReactNode;
  children?: React.ReactNode;
}

function isIconComponent(
  icon: React.ComponentType<{ className?: string }> | React.ReactNode | undefined
): icon is React.ComponentType<{ className?: string }> {
  return typeof icon === 'function';
}

const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn('animate-spin motion-reduce:animate-none', className)}
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    <path
      d="M12.5 7a5.5 5.5 0 0 0-5.5-5.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      asChild = false,
      isLoading = false,
      showTextWhileLoading = false,
      iconLeading,
      iconTrailing,
      className,
      children,
      disabled,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const resolvedVariant =
      (VARIANT_ALIASES as Record<string, ButtonVariantNative>)[variant as string] ??
      (variant as ButtonVariantNative);
    const resolvedSize =
      (SIZE_ALIASES as Record<string, ButtonSizeNative>)[size as string] ??
      (size as ButtonSizeNative);

    if (process.env.NODE_ENV !== 'production') {
      if (variant !== resolvedVariant) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Button] variant="${variant}" is deprecated. Use variant="${resolvedVariant}" instead.`
        );
      }
      if (size !== resolvedSize) {
        const message =
          size === 'icon'
            ? `[Button] size="icon" is deprecated. Drop the prop and pass an iconLeading/iconTrailing without children — icon-only mode is auto-detected.`
            : `[Button] size="${size}" is deprecated. Use size="${resolvedSize}" instead.`;
        // eslint-disable-next-line no-console
        console.warn(message);
      }
    }

    const hasChildren = children !== undefined && children !== null && children !== false;
    // `size === 'icon'` signals icon-only intent — checked on the raw prop before alias resolution.
    const hasIcon = iconLeading !== undefined || iconTrailing !== undefined || size === 'icon';
    const isIconOnly = !hasChildren && hasIcon;

    if (process.env.NODE_ENV !== 'production' && isIconOnly && !ariaLabel) {
      // eslint-disable-next-line no-console
      console.error('[Button] Icon-only buttons require an aria-label for accessibility.');
    }

    const iconOnlyClasses = isIconOnly
      ? { sm: 'w-8 !px-0', md: 'w-10 !px-0', lg: 'w-12 !px-0' }[resolvedSize]
      : '';

    const Comp = asChild ? Slot : 'button';

    const renderIcon = (
      icon: React.ComponentType<{ className?: string }> | React.ReactNode | undefined
    ) => {
      if (icon === undefined) return null;
      if (isIconComponent(icon)) {
        const IconComp = icon;
        return <IconComp className="size-4 shrink-0" />;
      }
      return icon;
    };

    const content = isLoading ? (
      <>
        <Spinner className="size-3.5" />
        {showTextWhileLoading && children}
      </>
    ) : (
      <>
        {renderIcon(iconLeading)}
        {children}
        {renderIcon(iconTrailing)}
      </>
    );

    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant: resolvedVariant, size: resolvedSize }),
          iconOnlyClasses,
          className
        )}
        /* With asChild + a non-button child (<a>, <Link>), `disabled` is a no-op and
           `disabled:` Tailwind variants won't activate. Consumer's responsibility. */
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        aria-disabled={disabled || isLoading || undefined}
        aria-label={ariaLabel}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
