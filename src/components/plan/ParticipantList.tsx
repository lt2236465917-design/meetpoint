import { formatTransportModes } from "@/lib/ui/transport-modes";
import type { TransportMode } from "@/types/domain";

type Participant = {
  id: string;
  name: string;
  departure_city_name: string;
  accepted_modes: TransportMode[];
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
          className="rounded-lg border border-white/10 bg-black/20 p-3"
          key={participant.id}
        >
          <div className="font-medium text-[var(--atmosphere-ink)]">
            {participant.name}
          </div>
          <div className="mt-1 text-sm text-[var(--atmosphere-muted)]">
            {participant.departure_city_name} ·{" "}
            {formatTransportModes(participant.accepted_modes)}
          </div>
        </div>
      ))}
    </div>
  );
}
