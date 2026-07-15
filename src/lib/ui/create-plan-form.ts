export type CreatePlanFormData = {
  title: string;
  arrivalDate: string;
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
  const arrivalDate = formValue(formData, "arrivalDate");
  const participantLimit = Number(formValue(formData, "participantLimit"));

  if (!title) {
    return { ok: false, error: "请输入计划名称" };
  }
  if (!arrivalDate) {
    return { ok: false, error: "请选择计划到达日期" };
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
      arrivalDate,
      participantLimit,
    },
  };
}
