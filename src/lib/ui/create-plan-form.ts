export type CreatePlanFormData = {
  title: string;
  meetingDate: string;
  targetArrivalTime: string;
  participantLimit: number;
};

type ParseCreatePlanFormResult =
  | { ok: true; data: CreatePlanFormData }
  | { ok: false; error: string };

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseCreatePlanForm(
  formData: FormData,
): ParseCreatePlanFormResult {
  const title = formValue(formData, "title");
  const meetingDate = formValue(formData, "meetingDate");
  const targetArrivalTime = formValue(formData, "targetArrivalTime");
  const participantLimit = Number(formValue(formData, "participantLimit"));

  if (!title) {
    return { ok: false, error: "请输入计划名称" };
  }
  if (!meetingDate) {
    return { ok: false, error: "请选择见面日期" };
  }
  if (!targetArrivalTime) {
    return { ok: false, error: "请选择目标到达时间" };
  }
  if (
    !Number.isInteger(participantLimit) ||
    participantLimit < 2 ||
    participantLimit > 6
  ) {
    return { ok: false, error: "参与人数需在 2-6 人之间" };
  }

  return {
    ok: true,
    data: {
      title,
      meetingDate,
      targetArrivalTime,
      participantLimit,
    },
  };
}
