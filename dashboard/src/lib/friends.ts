// Who wears which band. Each friend keeps the same band all event, so the dashboard picks
// the band number from the name. Replace the placeholders with your friends' real band
// numbers (the number on each band's bag). Never point a market at someone else's band.

export interface Friend {
  name: string;
  band: number;
}

export const FRIENDS: Friend[] = [
  { name: "Ahmed", band: 41 },
  { name: "Jordan", band: 12 }, // placeholder: replace with the real name and band number
  { name: "Haris", band: 17 }, // placeholder: replace with the real band number
  { name: "Maya", band: 23 }, // placeholder: replace with the real band number
];

export const friendLabel = (f: Friend) => `${f.name} · band #${f.band}`;

export function findFriend(band: number): Friend | undefined {
  return FRIENDS.find((f) => f.band === band);
}

/** Ask the Listen panel to listen to a friend (fired after a market is opened). */
export interface ListenRequest {
  friend: Friend;
  /** The friend and the people near them agreed to be recorded. */
  consent: boolean;
}

export function requestListen(req: ListenRequest): void {
  window.dispatchEvent(new CustomEvent<ListenRequest>("vexbets:listen", { detail: req }));
}
