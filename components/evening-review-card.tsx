import { Moon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile, profileTimezone } from "@/lib/db/profile";
import { getReviewForDate } from "@/lib/db/reviews";
import { getYMDInTZ } from "@/lib/time/tz";
import { markReviewAction } from "@/app/today/actions";

export async function EveningReviewCard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getProfile(supabase, user.id);
  const tz = profileTimezone(profile);
  const ymd = getYMDInTZ(new Date(), tz);
  const review = await getReviewForDate(supabase, user.id, ymd);
  if (!review) return null;
  if (review.user_response) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex gap-3 items-start border-l-[3px] border-l-primary">
      <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Moon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex flex-col gap-2 min-w-0 w-full">
        <span className="text-[10px] uppercase tracking-wider font-bold text-primary">
          вечірнє ревью
        </span>
        {review.summary && (
          <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">
            {review.summary}
          </p>
        )}
        {review.recommendation && (
          <p className="text-sm text-[var(--text-secondary)] leading-snug whitespace-pre-wrap pt-1 border-t border-border/40">
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
              на завтра
            </span>
            {review.recommendation}
          </p>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          <ReviewBtn id={review.id} response="ok" label="🟢 ок" />
          <ReviewBtn id={review.id} response="skip" label="⏭ пропустити" />
          <ReviewBtn id={review.id} response="not_today" label="не сьогодні" />
        </div>
      </div>
    </div>
  );
}

function ReviewBtn({
  id,
  response,
  label,
}: {
  id: number;
  response: "ok" | "skip" | "not_today";
  label: string;
}) {
  return (
    <form action={markReviewAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="response" value={response} />
      <button
        type="submit"
        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-muted/60 hover:bg-muted text-foreground transition-colors"
      >
        {label}
      </button>
    </form>
  );
}
