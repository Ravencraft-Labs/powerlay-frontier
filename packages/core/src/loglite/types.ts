export type LogLiteSeverity = "INFO" | "NOTICE" | "WARN" | "ERR";

/** First frame on every client connection. */
export interface LogLiteConnection {
  version: number;
  pid: number;
  machineName: string;
  executablePath: string;
}

/** One client log line, with large/continuation frames already joined. */
export interface LogLiteMessage {
  time: Date;
  severity: LogLiteSeverity;
  module: string;
  channel: string;
  message: string;
}

/** Server moved the character: login (fromSystemId null) or a system change. */
export interface LogLiteSessionEvent {
  kind: "session";
  time: Date;
  fromSystemId: number | null;
  systemId: number;
  charId: number | null;
  shipId: number | null;
}

/** Jump started through a stargate; the destination arrives as the next session event. */
export interface LogLiteJumpEvent {
  kind: "jump";
  time: Date;
  fromSystemId: number;
  gateId: number;
}

export interface LogLiteWarpEvent {
  kind: "warp";
  time: Date;
  state: "start" | "stop";
}

export type LogLiteEvent = LogLiteSessionEvent | LogLiteJumpEvent | LogLiteWarpEvent;
