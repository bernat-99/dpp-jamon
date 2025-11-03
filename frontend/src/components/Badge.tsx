interface BadgeProps {
  ok: boolean;
  textOk?: string;
  textKo?: string;
}

export function Badge({ ok, textOk = 'VERIFIED', textKo = 'UNVERIFIED' }: BadgeProps) {
  return (
    <span className={`badge ${ok ? 'ok' : 'ko'}`}>
      {ok ? textOk : textKo}
    </span>
  );
}
