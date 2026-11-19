import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/shared/theme/ThemeProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { isDark } = useTheme();

  return (
    <Sonner
      theme={isDark ? "dark" : "light"}
      // Passive feedback must not cover conversation controls. Only visible
      // toast actions remain pointer targets; live-region/focus behavior stays.
      className={
        "toaster group pointer-events-none " +
        "[&_[data-sonner-toast]]:pointer-events-none " +
        "[&_[data-sonner-toast][data-visible=true]_button]:pointer-events-auto " +
        "[&_[data-sonner-toast][data-visible=true]_a[href]]:pointer-events-auto"
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
