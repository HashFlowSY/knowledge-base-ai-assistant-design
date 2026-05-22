import type { ComponentPropsWithoutRef } from "react";

export type FormSubmitHandler = NonNullable<ComponentPropsWithoutRef<"form">["onSubmit"]>;
