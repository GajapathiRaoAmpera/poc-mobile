import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, router } from "expo-router";
import { useForm } from "react-hook-form";
import { Alert } from "react-native";
import { errorMessage, fieldErrors } from "@/api/client";
import { useChangePassword } from "@/api/auth";
import { changePasswordSchema } from "@/schemas/auth";
import { Button } from "@/ui/button";
import { Banner, FormField, FormScreen } from "@/ui/form";

type Values = { current_password: string; new_password: string; confirm: string };

export default function ChangePassword() {
  const change = useChangePassword();
  const { control, handleSubmit, setError } = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
    defaultValues: { current_password: "", new_password: "", confirm: "" },
  });

  const onSubmit = handleSubmit(({ current_password, new_password }) =>
    change.mutate(
      { current_password, new_password },
      {
        onSuccess: () => {
          Alert.alert("Password changed", "Other devices have been signed out.");
          router.back();
        },
        onError: (e) => {
          for (const [k, msg] of Object.entries(fieldErrors(e))) {
            if (k === "current_password" || k === "new_password") setError(k, { message: msg });
          }
        },
      },
    ),
  );
  const generalError = change.isError && !Object.keys(fieldErrors(change.error)).length;

  return (
    <FormScreen>
      <Stack.Screen options={{ title: "Change password" }} />
      {generalError ? <Banner text={errorMessage(change.error)} /> : null}
      <FormField control={control} name="current_password" label="Current password" secret autoComplete="current-password" textContentType="password" />
      <FormField
        control={control}
        name="new_password"
        label="New password"
        hint="At least 10 characters"
        secret
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <FormField control={control} name="confirm" label="Confirm new password" secret autoComplete="new-password" onSubmitEditing={() => void onSubmit()} />
      <Button label="Change password" block loading={change.isPending} onPress={() => void onSubmit()} />
    </FormScreen>
  );
}
