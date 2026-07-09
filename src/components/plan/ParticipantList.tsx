type Participant = {
  id: string;
  name: string;
  departure_city_name: string;
  accepted_modes: string[];
};

export function ParticipantList({
  participants,
}: {
  participants: Participant[];
}) {
  return (
    <div className="grid gap-2">
      {participants.map((participant) => (
        <div
          className="rounded-lg border border-gray-200 p-3"
          key={participant.id}
        >
          <div className="font-medium text-gray-950">{participant.name}</div>
          <div className="mt-1 text-sm text-gray-500">
            {participant.departure_city_name} ·{" "}
            {participant.accepted_modes.join(" / ")}
          </div>
        </div>
      ))}
    </div>
  );
}
