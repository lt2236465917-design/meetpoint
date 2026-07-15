"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { JoinParticipantForm } from "@/components/plan/JoinParticipantForm";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";
import { rememberMeetingHistoryItem } from "@/lib/ui/meeting-history";
import type { TransportMode } from "@/types/domain";

type JoinPlanPageProps = {
  params: Promise<{ code: string }>;
};

type PlanSummary = {
  title: string;
  meeting_date: string;
};

export default function JoinPlanPage({ params }: JoinPlanPageProps) {
  const { code } = use(params);
  const router = useRouter();
  const [planSummary, setPlanSummary] = useState<PlanSummary | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState<{ code: string; name: string } | null>(null);
  const [acceptedModes, setAcceptedModes] = useState<TransportMode[]>([
    "high_speed_rail",
  ]);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPlanSummary() {
      try {
        const response = await fetch(`/api/plans/${code}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { plan?: PlanSummary };
        if (active && data.plan) setPlanSummary(data.plan);
      } catch {
        // Local history can fall back to the plan code if this background read fails.
      }
    }

    void loadPlanSummary();

    return () => {
      active = false;
    };
  }, [code]);

  async function submit() {
    if (loading) return;
    if (!city) {
      setMessage("请选择出发城市");
      return;
    }

    setLoading(true);
    setMessage("");
    setSubmitted(false);

    try {
      const res = await fetch(`/api/plans/${code}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          departureCityCode: city.code,
          departureCityName: city.name,
          acceptedModes,
        }),
      });
      const json = await res.json();

      if (res.ok) {
        localStorage.setItem(`participant:${code}`, JSON.stringify(json));
        rememberMeetingHistoryItem({
          code,
          title: planSummary?.title ?? `见面计划 ${code}`,
          arrivalDate: planSummary?.meeting_date ?? "",
          role: "participant",
          participantEditToken: json.editToken,
          latestRun: false,
          lastVisitedAt: new Date().toISOString(),
        });
        setMessage("已提交成功，正在返回计划页。");
        setSubmitted(true);
        router.replace(`/p/${code}`);
        return;
      }

      setMessage(getApiErrorMessage(json.error, "提交失败，请稍后重试"));
    } catch {
      setMessage("提交失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ResponsiveShell
      title="填写出发信息"
      description="只需要你的出发城市和可接受交通方式，用来一起计算合适的见面城市。"
      backHref={`/p/${code}`}
      backLabel="返回计划页"
      aside={
        <p className="text-center text-xs leading-5 text-gray-500">
          交通方式只影响你的可接受路线，不会替别人做选择。
        </p>
      }
    >
      <JoinParticipantForm
        code={code}
        name={name}
        city={city}
        acceptedModes={acceptedModes}
        loading={loading}
        submitted={submitted}
        message={message}
        onNameChange={setName}
        onCityChange={setCity}
        onAcceptedModesChange={setAcceptedModes}
        onSubmit={submit}
      />
    </ResponsiveShell>
  );
}
