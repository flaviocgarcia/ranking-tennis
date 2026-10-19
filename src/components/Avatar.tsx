/** Avatar por iniciais — sem fotografias (requisito da 1ª versão). */
export function Avatar({
  initials,
  large = false,
}: {
  initials: string;
  large?: boolean;
}) {
  return (
    <span className={large ? "avatar lg" : "avatar"} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
