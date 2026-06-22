"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { FileDown, LogIn, Mic, MicOff, NotebookPen, PhoneOff, ScreenShare, ScreenShareOff, Video, VideoOff } from "lucide-react";
import {
  endSalesMeeting,
  joinSalesMeetingAsEmployee,
  joinSalesMeetingByToken,
  leaveSalesMeeting,
  updateSalesMeetingMediaState,
  type SalesMeetingJoinResult,
} from "@/app/employee/sales-meetings/actions";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type SalesMeeting = Database["public"]["Tables"]["sales_video_meetings"]["Row"];
type SalesMeetingParticipant = Database["public"]["Tables"]["sales_video_meeting_participants"]["Row"];

type SalesMeetingRoomProps =
  | {
      mode: "guest";
      token: string;
    }
  | {
      mode: "employee";
      meetingId: string;
    };

type SignalPayload = {
  meeting_id: string;
  from: string;
  to?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  audio_enabled?: boolean;
  video_enabled?: boolean;
  screen_sharing?: boolean;
  transcript_id?: string;
  transcript_text?: string;
  speaker?: string;
};

type TranscriptLine = {
  id: string;
  fromId: string;
  speaker: string;
  text: string;
  at: number;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; readonly [index: number]: { transcript: string } }>;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const globalWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };

  return globalWindow.SpeechRecognition ?? globalWindow.webkitSpeechRecognition ?? null;
}

type RemoteStreamState = {
  stream: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  connectionState: RTCPeerConnectionState;
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function shouldHideLocalScreenPreview(track: MediaStreamTrack) {
  const label = track.label.toLowerCase();

  return (
    label.includes("reliancepredictivesafetytechnologies") ||
    label.includes("reliance predictive safety") ||
    label.includes("safetydocs360") ||
    label.includes("sales meeting")
  );
}

const screenShareCaptureOptions = {
  audio: false,
  video: true,
  selfBrowserSurface: "exclude",
  surfaceSwitching: "include",
} as DisplayMediaStreamOptions & {
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
};

function mergeParticipant(participants: SalesMeetingParticipant[], participant: SalesMeetingParticipant) {
  const nextParticipants = participants.filter((item) => item.id !== participant.id);
  return [...nextParticipants, participant].sort((first, second) => (first.created_at ?? "").localeCompare(second.created_at ?? ""));
}

function MeetingStreamTile({
  label,
  muted,
  featured,
  sharingPlaceholder,
  state,
  stream,
}: {
  label: string;
  muted?: boolean;
  featured?: boolean;
  sharingPlaceholder?: boolean;
  state?: string;
  stream: MediaStream | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.enabled && track.readyState === "live"));
  const hasAudio = Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live"));

  useEffect(() => {
    const video = videoRef.current;
    setVideoReady(false);

    if (!video || !stream || !hasVideo) {
      if (video) {
        video.srcObject = null;
      }
      return;
    }

    video.srcObject = stream;
    const markReady = () => setVideoReady(video.videoWidth > 0 && video.videoHeight > 0);
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);
    void video.play().then(markReady).catch(() => setVideoReady(false));
    const readyCheckId = window.setTimeout(markReady, 900);

    return () => {
      window.clearTimeout(readyCheckId);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
    };
  }, [hasVideo, stream]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !stream || muted || !hasAudio) {
      if (audio) {
        audio.srcObject = null;
      }
      return;
    }

    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
  }, [hasAudio, muted, stream]);

  return (
    <div className={featured ? "employee-call-tile employee-call-tile-featured" : "employee-call-tile"}>
      {hasAudio && !muted ? <audio className="employee-call-audio" ref={audioRef} autoPlay playsInline /> : null}
      {sharingPlaceholder ? (
        <div className="employee-call-sharing-placeholder">
          <ScreenShare size={30} />
          <strong>Sharing your screen</strong>
          <span>Preview hidden to prevent mirror view</span>
        </div>
      ) : hasVideo ? (
        <>
          <video className={videoReady ? undefined : "employee-call-video-pending"} ref={videoRef} autoPlay playsInline muted />
          {!videoReady ? <div className="employee-call-avatar employee-call-avatar-overlay">{label.slice(0, 1)}</div> : null}
        </>
      ) : (
        <div className="employee-call-avatar">{label.slice(0, 1)}</div>
      )}
      <div>
        <strong>{label}</strong>
        {state ? <span>{state}</span> : null}
      </div>
    </div>
  );
}

export function SalesMeetingRoom(props: SalesMeetingRoomProps) {
  const mode = props.mode;
  const guestToken = props.mode === "guest" ? props.token : "";
  const employeeMeetingId = props.mode === "employee" ? props.meetingId : "";
  const supabase = useMemo(() => createClient(), []);
  const [guestName, setGuestName] = useState("");
  const [meeting, setMeeting] = useState<SalesMeeting | null>(null);
  const [participant, setParticipant] = useState<SalesMeetingParticipant | null>(null);
  const [participants, setParticipants] = useState<SalesMeetingParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, RemoteStreamState>>({});
  const [statusMessage, setStatusMessage] = useState(props.mode === "employee" ? "Opening host room..." : "");
  const [joining, setJoining] = useState(props.mode === "employee");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [hideLocalScreenPreview, setHideLocalScreenPreview] = useState(false);
  const [noteTaking, setNoteTaking] = useState(true);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const transcriptLinesRef = useRef<TranscriptLine[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const meetingRef = useRef<SalesMeeting | null>(null);
  const participantRef = useRef<SalesMeetingParticipant | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const employeeJoinStartedRef = useRef(false);

  const participantById = useMemo(() => new Map(participants.map((item) => [item.id, item])), [participants]);
  const joinedCount = participants.filter((item) => item.status === "joined").length || (participant ? 1 : 0);
  const screenShareActive = screenSharing || Object.values(remoteStreams).some((remote) => remote.screenSharing);

  const getParticipantLabel = useCallback(
    (participantId: string) => (participantId === participantRef.current?.id ? "You" : participantById.get(participantId)?.display_name || "Guest"),
    [participantById],
  );

  const sendSignal = useCallback(async (event: string, payload: Omit<SignalPayload, "meeting_id" | "from">) => {
    if (!channelRef.current || !meetingRef.current || !participantRef.current) {
      return;
    }

    await channelRef.current.send({
      type: "broadcast",
      event,
      payload: {
        ...payload,
        meeting_id: meetingRef.current.id,
        from: participantRef.current.id,
      } satisfies SignalPayload,
    });
  }, []);

  const appendTranscriptLine = useCallback((line: TranscriptLine) => {
    setTranscriptLines((current) => {
      if (current.some((existing) => existing.id === line.id)) {
        return current;
      }

      return [...current, line].slice(-800);
    });
  }, []);

  const recordLocalSpeech = useCallback(
    (text: string) => {
      const currentParticipant = participantRef.current;
      const cleanedText = text.trim();

      if (!currentParticipant || !cleanedText) {
        return;
      }

      const line: TranscriptLine = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${currentParticipant.id}-${Date.now()}`,
        fromId: currentParticipant.id,
        speaker: currentParticipant.display_name || "You",
        text: cleanedText,
        at: Date.now(),
      };

      appendTranscriptLine(line);
      void sendSignal("transcript", { transcript_id: line.id, transcript_text: line.text, speaker: line.speaker });
    },
    [appendTranscriptLine, sendSignal],
  );

  const handleGenerateNotes = useCallback(async () => {
    const lines = transcriptLinesRef.current;

    if (lines.length === 0) {
      setStatusMessage("No notes captured yet. Turn on note-taking and speak before generating.");
      return false;
    }

    setGeneratingNotes(true);

    try {
      const transcript = lines.map((line) => `${line.speaker}: ${line.text}`).join("\n");
      const participantNames = Array.from(new Set(lines.map((line) => line.speaker)));
      const title = meetingRef.current?.title || "Sales Meeting Notes";

      const response = await fetch("/api/sales-meetings/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId: meetingRef.current?.id,
          title,
          transcript,
          participants: participantNames,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorBody?.error ?? "Could not generate meeting notes.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${title.replace(/[^\w.-]+/g, "_").replace(/^_|_$/g, "") || "meeting-notes"}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      setStatusMessage("Meeting notes downloaded as a Word document.");
      return true;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not generate meeting notes.");
      return false;
    } finally {
      setGeneratingNotes(false);
    }
  }, []);

  const updateMediaState = useCallback(
    (patch: Pick<SignalPayload, "audio_enabled" | "video_enabled" | "screen_sharing">) => {
      void sendSignal("media_state", patch);

      if (meetingRef.current && participantRef.current) {
        void updateSalesMeetingMediaState({
          meetingId: meetingRef.current.id,
          participantId: participantRef.current.id,
          audioEnabled: patch.audio_enabled,
          videoEnabled: patch.video_enabled,
          screenSharing: patch.screen_sharing,
        }).catch((error) => setStatusMessage(error instanceof Error ? error.message : "Could not update media state."));
      }
    },
    [sendSignal],
  );

  const closePeerConnections = useCallback(() => {
    Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
    peerConnectionsRef.current = {};
    setRemoteStreams({});
  }, []);

  const cleanupMeeting = useCallback(
    async (notifyServer?: boolean) => {
      const currentMeetingId = meetingRef.current?.id;
      const currentParticipantId = participantRef.current?.id;

      if (notifyServer && currentMeetingId && currentParticipantId) {
        await leaveSalesMeeting(currentMeetingId, currentParticipantId).catch(() => undefined);
      }

      if (channelRef.current && supabase) {
        void channelRef.current.untrack();
        void supabase.removeChannel(channelRef.current);
      }

      channelRef.current = null;
      meetingRef.current = null;
      participantRef.current = null;
      closePeerConnections();
      stopStream(screenStreamRef.current);
      stopStream(cameraStreamRef.current);
      screenStreamRef.current = null;
      cameraStreamRef.current = null;
      localStreamRef.current = null;
      setLocalStream(null);
      setMeeting(null);
      setParticipant(null);
      setParticipants([]);
      setMuted(false);
      setCameraOff(false);
      setScreenSharing(false);
      setHideLocalScreenPreview(false);
    },
    [closePeerConnections, supabase],
  );

  const ensurePeerConnection = useCallback(
    (remoteParticipantId: string) => {
      if (peerConnectionsRef.current[remoteParticipantId]) {
        return peerConnectionsRef.current[remoteParticipantId];
      }

      const connection = new RTCPeerConnection({
        iceServers: iceServersRef.current,
      });

      localStreamRef.current?.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          connection.addTrack(track, localStreamRef.current);
        }
      });

      connection.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal("ice_candidate", { to: remoteParticipantId, candidate: event.candidate.toJSON() });
        }
      };

      connection.ontrack = (event) => {
        const [stream] = event.streams;

        if (!stream) {
          return;
        }

        setRemoteStreams((currentStreams) => ({
          ...currentStreams,
          [remoteParticipantId]: {
            stream,
            audioEnabled: currentStreams[remoteParticipantId]?.audioEnabled ?? true,
            videoEnabled: currentStreams[remoteParticipantId]?.videoEnabled ?? true,
            screenSharing: currentStreams[remoteParticipantId]?.screenSharing ?? false,
            connectionState: connection.connectionState,
          },
        }));
      };

      connection.onconnectionstatechange = () => {
        setRemoteStreams((currentStreams) => {
          const current = currentStreams[remoteParticipantId];

          if (!current) {
            return currentStreams;
          }

          return {
            ...currentStreams,
            [remoteParticipantId]: {
              ...current,
              connectionState: connection.connectionState,
            },
          };
        });
      };

      peerConnectionsRef.current[remoteParticipantId] = connection;
      return connection;
    },
    [sendSignal],
  );

  const createOfferForParticipant = useCallback(
    async (remoteParticipantId: string) => {
      const connection = ensurePeerConnection(remoteParticipantId);

      if (connection.signalingState !== "stable") {
        return;
      }

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendSignal("offer", { to: remoteParticipantId, description: connection.localDescription?.toJSON() });
    },
    [ensurePeerConnection, sendSignal],
  );

  const acquireMeetingMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support microphone and camera calls.");
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      cameraStreamRef.current = stream;
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch (videoError) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      cameraStreamRef.current = stream;
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraOff(true);
      setStatusMessage(videoError instanceof Error ? `Camera unavailable. Joined with audio only: ${videoError.message}` : "Camera unavailable. Joined with audio only.");
    }
  }, []);

  const connectToMeeting = useCallback(
    async (result: SalesMeetingJoinResult) => {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      // Fetch ICE config (includes TURN if configured server-side)
      try {
        const iceResponse = await fetch("/api/ice-config");
        if (iceResponse.ok) {
          const iceData = (await iceResponse.json()) as { iceServers?: RTCIceServer[] };
          if (Array.isArray(iceData.iceServers) && iceData.iceServers.length > 0) {
            iceServersRef.current = iceData.iceServers;
          }
        }
      } catch {
        // Non-fatal — falls back to STUN only
      }

      await cleanupMeeting();
      setTranscriptLines([]);
      setMeeting(result.meeting);
      setParticipant(result.participant);
      setParticipants(result.participants);
      meetingRef.current = result.meeting;
      participantRef.current = result.participant;

      await acquireMeetingMedia();

      const channel = supabase.channel(`sales-meeting:${result.meeting.id}`, {
        config: {
          private: true,
          broadcast: { ack: true },
          presence: { key: result.participant.id },
        },
      });

      channelRef.current = channel;

      channel
        .on("broadcast", { event: "offer" }, async ({ payload }: { payload: SignalPayload }) => {
          if (payload.meeting_id !== result.meeting.id || payload.to !== result.participant.id || payload.from === result.participant.id || !payload.description) {
            return;
          }

          const connection = ensurePeerConnection(payload.from);
          await connection.setRemoteDescription(new RTCSessionDescription(payload.description));
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await sendSignal("answer", { to: payload.from, description: connection.localDescription?.toJSON() });
        })
        .on("broadcast", { event: "answer" }, async ({ payload }: { payload: SignalPayload }) => {
          if (payload.meeting_id !== result.meeting.id || payload.to !== result.participant.id || payload.from === result.participant.id || !payload.description) {
            return;
          }

          const connection = peerConnectionsRef.current[payload.from];
          if (connection && connection.signalingState !== "stable") {
            await connection.setRemoteDescription(new RTCSessionDescription(payload.description));
          }
        })
        .on("broadcast", { event: "ice_candidate" }, async ({ payload }: { payload: SignalPayload }) => {
          if (payload.meeting_id !== result.meeting.id || payload.to !== result.participant.id || payload.from === result.participant.id || !payload.candidate) {
            return;
          }

          const connection = ensurePeerConnection(payload.from);
          await connection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        })
        .on("broadcast", { event: "media_state" }, ({ payload }: { payload: SignalPayload }) => {
          if (payload.meeting_id !== result.meeting.id || payload.from === result.participant.id) {
            return;
          }

          setRemoteStreams((currentStreams) => {
            const current = currentStreams[payload.from];

            if (!current) {
              return currentStreams;
            }

            return {
              ...currentStreams,
              [payload.from]: {
                ...current,
                audioEnabled: payload.audio_enabled ?? current.audioEnabled,
                videoEnabled: payload.video_enabled ?? current.videoEnabled,
                screenSharing: payload.screen_sharing ?? current.screenSharing,
              },
            };
          });
        })
        .on("broadcast", { event: "transcript" }, ({ payload }: { payload: SignalPayload }) => {
          if (payload.meeting_id !== result.meeting.id || payload.from === result.participant.id || !payload.transcript_text) {
            return;
          }

          appendTranscriptLine({
            id: payload.transcript_id || `${payload.from}-${Date.now()}`,
            fromId: payload.from,
            speaker: payload.speaker || "Guest",
            text: payload.transcript_text,
            at: Date.now(),
          });
        })
        .on("broadcast", { event: "leave" }, ({ payload }: { payload: SignalPayload }) => {
          if (payload.meeting_id !== result.meeting.id || payload.from === result.participant.id) {
            return;
          }

          peerConnectionsRef.current[payload.from]?.close();
          delete peerConnectionsRef.current[payload.from];
          setRemoteStreams((currentStreams) => {
            const nextStreams = { ...currentStreams };
            delete nextStreams[payload.from];
            return nextStreams;
          });
        })
        .on("broadcast", { event: "end" }, ({ payload }: { payload: SignalPayload }) => {
          if (payload.meeting_id === result.meeting.id && payload.from !== result.participant.id) {
            void cleanupMeeting();
            setStatusMessage("The meeting has ended.");
          }
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          Object.keys(state).forEach((remoteParticipantId) => {
            if (remoteParticipantId !== result.participant.id && result.participant.id < remoteParticipantId) {
              void createOfferForParticipant(remoteParticipantId);
            }
          });
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              participant_id: result.participant.id,
              display_name: result.participant.display_name,
              joined_at: new Date().toISOString(),
            });
            await sendSignal("media_state", {
              audio_enabled: !muted,
              video_enabled: !cameraOff,
              screen_sharing: screenSharing,
            });
          }

          if (status === "CHANNEL_ERROR") {
            setStatusMessage("Could not connect to the meeting channel.");
          }
        });
    },
    [
      acquireMeetingMedia,
      appendTranscriptLine,
      cameraOff,
      cleanupMeeting,
      createOfferForParticipant,
      ensurePeerConnection,
      muted,
      screenSharing,
      sendSignal,
      supabase,
    ],
  );

  useEffect(() => {
    if (!supabase || !meeting) {
      return;
    }

    const channel = supabase
      .channel(`sales-meeting-state-${meeting.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales_video_meeting_participants",
          filter: `meeting_id=eq.${meeting.id}`,
        },
        (payload) => {
          const nextParticipant = payload.new as SalesMeetingParticipant;
          setParticipants((currentParticipants) => mergeParticipant(currentParticipants, nextParticipant));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sales_video_meetings",
          filter: `id=eq.${meeting.id}`,
        },
        (payload) => {
          const nextMeeting = payload.new as SalesMeeting;
          setMeeting(nextMeeting);
          meetingRef.current = nextMeeting;

          if (nextMeeting.status === "ended" || nextMeeting.status === "cancelled") {
            void cleanupMeeting();
            setStatusMessage("The meeting has ended.");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cleanupMeeting, meeting, supabase]);

  useEffect(() => {
    if (mode !== "employee" || employeeJoinStartedRef.current) {
      return;
    }

    let cancelled = false;
    employeeJoinStartedRef.current = true;
    setJoining(true);

    joinSalesMeetingAsEmployee(employeeMeetingId)
      .then(async (result) => {
        if (!cancelled) {
          await connectToMeeting(result);
          setStatusMessage("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Could not open the meeting.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setJoining(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connectToMeeting, employeeMeetingId, mode]);

  useEffect(
    () => () => {
      void cleanupMeeting();
    },
    [cleanupMeeting],
  );

  useEffect(() => {
    transcriptLinesRef.current = transcriptLines;
  }, [transcriptLines]);

  useEffect(() => {
    if (!participant || !noteTaking || muted) {
      return;
    }

    const RecognitionCtor = getSpeechRecognitionCtor();

    if (!RecognitionCtor) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);

    const recognition = new RecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    let active = true;

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];

        if (result.isFinal) {
          recordLocalSpeech(result[0]?.transcript ?? "");
        }
      }
    };

    recognition.onend = () => {
      if (active) {
        try {
          recognition.start();
        } catch {
          // Recognition is already (re)starting; ignore.
        }
      }
    };

    recognition.onerror = () => {
      // Transient errors (no-speech, aborted) resolve on the next onend restart.
    };

    try {
      recognition.start();
    } catch {
      // A prior instance is still releasing the mic; the onend handler will retry.
    }

    return () => {
      active = false;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
    };
  }, [participant, noteTaking, muted, recordLocalSpeech]);

  async function handleGuestJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "guest" || joining) {
      return;
    }

    setJoining(true);
    setStatusMessage("");

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const { error } = await supabase.auth.signInAnonymously();

        if (error) {
          throw new Error(error.message);
        }
      }

      const result = await joinSalesMeetingByToken(guestToken, guestName);

      if (!result.ok) {
        setStatusMessage(result.error);
        return;
      }

      await connectToMeeting(result);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not join the meeting.");
    } finally {
      setJoining(false);
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
    updateMediaState({
      audio_enabled: !nextMuted,
      video_enabled: !cameraOff,
      screen_sharing: screenSharing,
    });
  }

  function toggleCamera() {
    const nextCameraOff = !cameraOff;
    cameraStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setCameraOff(nextCameraOff);
    updateMediaState({
      audio_enabled: !muted,
      video_enabled: !nextCameraOff,
      screen_sharing: screenSharing,
    });
  }

  async function stopScreenShare() {
    const cameraVideoTrack = cameraStreamRef.current?.getVideoTracks()[0] ?? null;

    Object.values(peerConnectionsRef.current).forEach((connection) => {
      const sender = connection.getSenders().find((item) => item.track?.kind === "video");
      void sender?.replaceTrack(cameraVideoTrack);
    });

    stopStream(screenStreamRef.current);
    screenStreamRef.current = null;
    localStreamRef.current = cameraStreamRef.current;
    setLocalStream(cameraStreamRef.current);
    setScreenSharing(false);
    setHideLocalScreenPreview(false);
    updateMediaState({
      audio_enabled: !muted,
      video_enabled: !cameraOff,
      screen_sharing: false,
    });
  }

  async function toggleScreenShare() {
    if (screenSharing) {
      await stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setStatusMessage("This browser does not support screen sharing.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(screenShareCaptureOptions);
      const screenTrack = stream.getVideoTracks()[0];

      if (!screenTrack) {
        stopStream(stream);
        return;
      }

      screenStreamRef.current = stream;
      screenTrack.onended = () => {
        void stopScreenShare();
      };

      Object.values(peerConnectionsRef.current).forEach((connection) => {
        const sender = connection.getSenders().find((item) => item.track?.kind === "video");
        void sender?.replaceTrack(screenTrack);
      });

      const audioTracks = cameraStreamRef.current?.getAudioTracks() ?? [];
      const previewStream = new MediaStream([...audioTracks, screenTrack]);
      localStreamRef.current = previewStream;
      setLocalStream(previewStream);
      setScreenSharing(true);
      setHideLocalScreenPreview(shouldHideLocalScreenPreview(screenTrack));
      updateMediaState({
        audio_enabled: !muted,
        video_enabled: true,
        screen_sharing: true,
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not start screen sharing.");
    }
  }

  async function handleLeave() {
    await sendSignal("leave", {});
    await cleanupMeeting(true);
    setStatusMessage("You left the meeting.");
  }

  async function handleEnd() {
    if (!meeting) {
      return;
    }

    try {
      if (noteTaking && transcriptLinesRef.current.length > 0) {
        await handleGenerateNotes();
      }

      await sendSignal("end", {});
      await endSalesMeeting(meeting.id);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not end the meeting.");
    } finally {
      await cleanupMeeting();
    }
  }

  if (mode === "guest" && !participant) {
    return (
      <main className="sales-meeting-public">
        <section className="sales-meeting-lobby" aria-labelledby="sales-meeting-lobby-title">
          <span className="eyebrow">Reliance Sales Meeting</span>
          <h1 id="sales-meeting-lobby-title">Join video presentation</h1>
          <p>Enter your name, then allow microphone and camera access when your browser asks.</p>
          <form className="sales-meeting-form" onSubmit={handleGuestJoin}>
            <div className="field">
              <label htmlFor="guest-name">Display name</label>
              <input id="guest-name" value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Your name" />
            </div>
            <button className="button button-primary" type="submit" disabled={joining}>
              <LogIn size={17} />
              {joining ? "Joining..." : "Join meeting"}
            </button>
          </form>
          {statusMessage ? <div className="sales-meeting-status">{statusMessage}</div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="sales-meeting-room">
      <header className="sales-meeting-room-header">
        <div>
          <span className="eyebrow">Reliance Sales Meeting</span>
          <h1>{meeting?.title ?? "Video presentation"}</h1>
        </div>
        <span>{joining ? "Connecting..." : `${joinedCount} in meeting`}</span>
      </header>
      {statusMessage ? <div className="sales-meeting-status">{statusMessage}</div> : null}
      {participant ? (
        <>
          <section className={screenShareActive ? "employee-call-tray employee-call-tray-screen-share sales-meeting-call-tray" : "employee-call-tray sales-meeting-call-tray"} aria-label="Sales video meeting">
            <div className="employee-call-stage">
              <MeetingStreamTile
                featured={screenSharing}
                label="You"
                muted
                sharingPlaceholder={screenSharing && hideLocalScreenPreview}
                state={`${muted ? "Muted" : "Mic on"}${screenSharing ? " - Sharing screen" : cameraOff ? " - Camera off" : ""}`}
                stream={screenSharing && hideLocalScreenPreview ? null : localStream}
              />
              {Object.entries(remoteStreams).map(([participantId, remote]) => (
                <MeetingStreamTile
                  featured={remote.screenSharing}
                  key={participantId}
                  label={getParticipantLabel(participantId)}
                  state={`${remote.audioEnabled ? "Mic on" : "Muted"}${remote.screenSharing ? " - Sharing screen" : remote.videoEnabled ? "" : " - Camera off"}`}
                  stream={remote.stream}
                />
              ))}
            </div>
            <div className="employee-call-controls">
              <button className={muted ? "active" : undefined} type="button" onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>
                {muted ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
              <button className={cameraOff ? "active" : undefined} type="button" onClick={toggleCamera} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}>
                {cameraOff ? <VideoOff size={17} /> : <Video size={17} />}
              </button>
              <button className={screenSharing ? "active" : undefined} type="button" onClick={() => void toggleScreenShare()} aria-label={screenSharing ? "Stop sharing screen" : "Share screen"}>
                {screenSharing ? <ScreenShareOff size={17} /> : <ScreenShare size={17} />}
              </button>
              <button
                className={noteTaking ? "active" : undefined}
                type="button"
                onClick={() => setNoteTaking((value) => !value)}
                aria-label={noteTaking ? "Stop AI note-taking" : "Start AI note-taking"}
              >
                <NotebookPen size={17} />
                {noteTaking ? "Notes on" : "Notes"}
              </button>
              {mode === "employee" ? (
                <button className="employee-call-end" type="button" onClick={() => void handleEnd()} aria-label="End meeting for everyone">
                  <PhoneOff size={17} />
                  End
                </button>
              ) : null}
              <button type="button" onClick={() => void handleLeave()}>
                Leave
              </button>
            </div>
            <div className="employee-call-participants">
              {participants.map((item) => (
                <span key={item.id}>
                  {item.display_name} - {item.status}
                </span>
              ))}
            </div>
            <div className="sales-meeting-notes">
              <div className="sales-meeting-notes-head">
                <div>
                  <strong>AI meeting notes</strong>
                  <span>
                    {noteTaking
                      ? speechSupported
                        ? "Listening to your microphone"
                        : "Live notes need Chrome or Edge on this device"
                      : "Note-taking paused"}
                    {" · "}
                    {transcriptLines.length} {transcriptLines.length === 1 ? "line" : "lines"} captured
                  </span>
                </div>
                {mode === "employee" ? (
                  <button
                    type="button"
                    className="sales-meeting-notes-download"
                    onClick={() => void handleGenerateNotes()}
                    disabled={generatingNotes || transcriptLines.length === 0}
                  >
                    <FileDown size={16} />
                    {generatingNotes ? "Generating..." : "Download Word notes"}
                  </button>
                ) : null}
              </div>
              <div className="sales-meeting-notes-feed">
                {transcriptLines.length === 0 ? (
                  <p className="sales-meeting-notes-empty">
                    Spoken words appear here as the call goes. A Word document with an AI summary, decisions, and action items is ready to
                    download at the end.
                  </p>
                ) : (
                  transcriptLines.slice(-8).map((line) => (
                    <p key={line.id}>
                      <strong>{line.fromId === participant?.id ? "You" : line.speaker}:</strong> {line.text}
                    </p>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
