"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Bell,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  Radio,
  ScreenShare,
  ScreenShareOff,
  Send,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  declineChatCall,
  endChatCall,
  ensureDirectThread,
  joinChatCall,
  leaveChatCall,
  markChatNotificationsRead,
  sendChatMessage,
  startChatCall,
} from "@/app/employee/chat/actions";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type EmployeeChatProfile = Database["public"]["Tables"]["employee_chat_profiles"]["Row"];
type EmployeeChatThread = Database["public"]["Tables"]["employee_chat_threads"]["Row"];
type EmployeeChatMessage = Database["public"]["Tables"]["employee_chat_messages"]["Row"];
type EmployeeChatCall = Database["public"]["Tables"]["employee_chat_calls"]["Row"];
type EmployeeChatCallParticipant = Database["public"]["Tables"]["employee_chat_call_participants"]["Row"];
type PortalNotification = Database["public"]["Tables"]["portal_notifications"]["Row"];

type EmployeePresenceChatProps = {
  currentUser: {
    id: string;
    displayName: string;
    email: string | null;
  };
  companyThread: EmployeeChatThread | null;
  initialProfiles: EmployeeChatProfile[];
  initialCompanyMessages: EmployeeChatMessage[];
  initialUnreadChatNotificationCount: number;
};

type PresencePayload = {
  user_id: string;
  display_name: string;
  email: string | null;
  online_at: string;
};

type CallPresencePayload = {
  user_id: string;
  display_name: string;
  joined_at: string;
};

type SignalPayload = {
  call_id: string;
  from: string;
  to?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  audio_enabled?: boolean;
  video_enabled?: boolean;
  screen_sharing?: boolean;
};

type RemoteStreamState = {
  stream: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  connectionState: RTCPeerConnectionState;
};

function getProfileName(profile: Pick<EmployeeChatProfile, "display_name" | "email" | "user_id"> | undefined) {
  return profile?.display_name || profile?.email || profile?.user_id.slice(0, 8) || "Employee";
}

function mergeMessage(messages: EmployeeChatMessage[], message: EmployeeChatMessage) {
  if (messages.some((item) => item.id === message.id)) {
    return messages;
  }

  return [...messages, message].sort((first, second) => (first.created_at ?? "").localeCompare(second.created_at ?? ""));
}

function mergeParticipant(participants: EmployeeChatCallParticipant[], participant: EmployeeChatCallParticipant) {
  const nextParticipants = participants.filter((item) => item.id !== participant.id && item.user_id !== participant.user_id);
  return [...nextParticipants, participant].sort((first, second) => (first.created_at ?? "").localeCompare(second.created_at ?? ""));
}

function formatChatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function shouldHideLocalScreenPreview(track: MediaStreamTrack) {
  const label = track.label.toLowerCase();

  return (
    label.includes("reliancepredictivesafetytechnologies") ||
    label.includes("reliance predictive safety") ||
    label.includes("safetydocs360") ||
    label.includes("team chat")
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

function getAudioContextConstructor() {
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function primeIncomingCallAudio(audioContextRef: { current: AudioContext | null }) {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) {
    return false;
  }

  if (!audioContextRef.current || audioContextRef.current.state === "closed") {
    audioContextRef.current = new AudioContextConstructor();
  }

  if (audioContextRef.current.state === "suspended") {
    await audioContextRef.current.resume();
  }

  const oscillator = audioContextRef.current.createOscillator();
  const gain = audioContextRef.current.createGain();
  gain.gain.setValueAtTime(0.0001, audioContextRef.current.currentTime);
  oscillator.connect(gain);
  gain.connect(audioContextRef.current.destination);
  oscillator.start();
  oscillator.stop(audioContextRef.current.currentTime + 0.025);
  return true;
}

async function playIncomingCallTone(audioContextRef: { current: AudioContext | null }) {
  const audioReady = await primeIncomingCallAudio(audioContextRef);

  if (!audioReady || !audioContextRef.current) {
    return;
  }

  const audioContext = audioContextRef.current;
  const startTime = audioContext.currentTime;
  const tones = [0, 0.18, 0.48, 0.66];

  tones.forEach((offset) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, startTime + offset);
    gain.gain.setValueAtTime(0.0001, startTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, startTime + offset + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + 0.14);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startTime + offset);
    oscillator.stop(startTime + offset + 0.16);
  });
}

function StreamTile({
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

  useEffect(() => {
    const video = videoRef.current;
    const hasLiveVideo = Boolean(stream?.getVideoTracks().some((track) => track.enabled && track.readyState === "live"));

    setVideoReady(false);

    if (!video || !stream || !hasLiveVideo) {
      if (video) {
        video.srcObject = null;
      }

      return;
    }

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const markReady = () => {
      setVideoReady(video.videoWidth > 0 && video.videoHeight > 0);
    };

    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);

    void video.play().then(markReady).catch(() => {
      setVideoReady(false);
    });

    const readyCheckId = window.setTimeout(markReady, 900);

    return () => {
      window.clearTimeout(readyCheckId);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
    };
  }, [stream]);

  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.enabled && track.readyState === "live"));
  const hasAudio = Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live"));

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !stream || muted || !hasAudio) {
      if (audio) {
        audio.srcObject = null;
      }

      return;
    }

    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }

    void audio.play().catch(() => {
      // Remote audio can require another user gesture in some browser states.
    });
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

export function EmployeePresenceChat({
  currentUser,
  companyThread,
  initialProfiles,
  initialCompanyMessages,
  initialUnreadChatNotificationCount,
}: EmployeePresenceChatProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"company" | "direct">("company");
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [directThreads, setDirectThreads] = useState<Record<string, EmployeeChatThread>>({});
  const [messagesByThread, setMessagesByThread] = useState<Record<string, EmployeeChatMessage[]>>(() =>
    companyThread ? { [companyThread.id]: initialCompanyMessages } : {},
  );
  const [draft, setDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loadingThreadId, setLoadingThreadId] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(initialUnreadChatNotificationCount);
  const [latestNotificationTitle, setLatestNotificationTitle] = useState("");
  const [incomingCall, setIncomingCall] = useState<EmployeeChatCall | null>(null);
  const [activeCall, setActiveCall] = useState<EmployeeChatCall | null>(null);
  const [callParticipants, setCallParticipants] = useState<EmployeeChatCallParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, RemoteStreamState>>({});
  const [callStatusMessage, setCallStatusMessage] = useState("");
  const [callConnecting, setCallConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [hideLocalScreenPreview, setHideLocalScreenPreview] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const activeCallRef = useRef<EmployeeChatCall | null>(null);
  const callChannelRef = useRef<RealtimeChannel | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const incomingCallAudioRef = useRef<AudioContext | null>(null);
  const incomingCallRingIntervalRef = useRef<number | null>(null);
  const lastIncomingCallToneRef = useRef<string | null>(null);

  const profileByUserId = useMemo(
    () => new Map(initialProfiles.map((profile) => [profile.user_id, profile])),
    [initialProfiles],
  );
  const currentUserProfile = profileByUserId.get(currentUser.id);
  const activeProfiles = useMemo(
    () =>
      initialProfiles
        .filter((profile) => profile.user_id !== currentUser.id && profile.account_status === "active")
        .sort((first, second) => {
          const firstOnline = onlineUserIds.has(first.user_id) ? 0 : 1;
          const secondOnline = onlineUserIds.has(second.user_id) ? 0 : 1;

          if (firstOnline !== secondOnline) {
            return firstOnline - secondOnline;
          }

          return getProfileName(first).localeCompare(getProfileName(second));
        }),
    [currentUser.id, initialProfiles, onlineUserIds],
  );

  const selectedRecipient = selectedRecipientId ? profileByUserId.get(selectedRecipientId) : null;
  const activeThread = activeTab === "company" ? companyThread : selectedRecipientId ? directThreads[selectedRecipientId] : null;
  const activeMessages = activeThread ? messagesByThread[activeThread.id] ?? [] : [];
  const onlineCount = [...onlineUserIds].filter((userId) => userId !== currentUser.id).length;
  const toggleBadgeCount = unreadChatCount > 0 ? unreadChatCount : onlineCount;
  const incomingCallerName = incomingCall?.created_by ? getProfileName(profileByUserId.get(incomingCall.created_by)) : "Someone";
  const callParticipantCount = Math.max(1, Object.keys(remoteStreams).length + (activeCall ? 1 : 0));
  const remoteScreenSharingUserIds = Object.entries(remoteStreams)
    .filter(([, remote]) => remote.screenSharing)
    .map(([userId]) => userId);
  const screenShareActive = screenSharing || remoteScreenSharingUserIds.length > 0;

  const getUserLabel = useCallback(
    (userId: string) => (userId === currentUser.id ? "You" : getProfileName(profileByUserId.get(userId))),
    [currentUser.id, profileByUserId],
  );

  const setLoadedDirectThread = useCallback(
    async (thread: EmployeeChatThread) => {
      if (thread.thread_type !== "direct") {
        setActiveTab("company");
        return;
      }

      const otherUserId = thread.participant_one_user_id === currentUser.id ? thread.participant_two_user_id : thread.participant_one_user_id;

      if (!otherUserId) {
        return;
      }

      setDirectThreads((currentThreads) => ({ ...currentThreads, [otherUserId]: thread }));
      setSelectedRecipientId(otherUserId);
      setActiveTab("direct");
    },
    [currentUser.id],
  );

  const sendSignal = useCallback(async (event: string, payload: Omit<SignalPayload, "call_id" | "from">) => {
    if (!callChannelRef.current || !activeCallRef.current) {
      return;
    }

    await callChannelRef.current.send({
      type: "broadcast",
      event,
      payload: {
        ...payload,
        call_id: activeCallRef.current.id,
        from: currentUser.id,
      } satisfies SignalPayload,
    });
  }, [currentUser.id]);

  const updateParticipantMedia = useCallback(
    (patch: Pick<SignalPayload, "audio_enabled" | "video_enabled" | "screen_sharing">) => {
      if (patch.audio_enabled !== undefined || patch.video_enabled !== undefined || patch.screen_sharing !== undefined) {
        void sendSignal("media_state", patch);
      }

      if (supabase && activeCallRef.current) {
        void supabase
          .from("employee_chat_call_participants")
          .update({
            audio_enabled: patch.audio_enabled,
            video_enabled: patch.video_enabled,
            screen_sharing: patch.screen_sharing,
          })
          .eq("call_id", activeCallRef.current.id)
          .eq("user_id", currentUser.id);
      }
    },
    [currentUser.id, sendSignal, supabase],
  );

  const closePeerConnections = useCallback(() => {
    Object.values(peerConnectionsRef.current).forEach((connection) => connection.close());
    peerConnectionsRef.current = {};
    setRemoteStreams({});
  }, []);

  const cleanupCall = useCallback(
    async (options?: { notifyServer?: boolean }) => {
      const callId = activeCallRef.current?.id;

      if (options?.notifyServer && callId) {
        await leaveChatCall(callId).catch((error) => {
          console.error("Could not leave chat call.", error);
        });
      }

      if (callChannelRef.current && supabase) {
        void callChannelRef.current.untrack();
        void supabase.removeChannel(callChannelRef.current);
      }

      callChannelRef.current = null;
      activeCallRef.current = null;
      closePeerConnections();
      stopStream(screenStreamRef.current);
      stopStream(cameraStreamRef.current);
      screenStreamRef.current = null;
      cameraStreamRef.current = null;
      localStreamRef.current = null;
      setLocalStream(null);
      setActiveCall(null);
      setCallParticipants([]);
      setCallConnecting(false);
      setMuted(false);
      setCameraOff(false);
      setScreenSharing(false);
      setHideLocalScreenPreview(false);
      setCallStatusMessage("");
    },
    [closePeerConnections, supabase],
  );

  const ensurePeerConnection = useCallback(
    (remoteUserId: string) => {
      if (peerConnectionsRef.current[remoteUserId]) {
        return peerConnectionsRef.current[remoteUserId];
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
          void sendSignal("ice_candidate", { to: remoteUserId, candidate: event.candidate.toJSON() });
        }
      };

      connection.ontrack = (event) => {
        const [stream] = event.streams;

        if (!stream) {
          return;
        }

        setRemoteStreams((currentStreams) => ({
          ...currentStreams,
          [remoteUserId]: {
            stream,
            audioEnabled: currentStreams[remoteUserId]?.audioEnabled ?? true,
            videoEnabled: currentStreams[remoteUserId]?.videoEnabled ?? true,
            screenSharing: currentStreams[remoteUserId]?.screenSharing ?? false,
            connectionState: connection.connectionState,
          },
        }));
      };

      connection.onconnectionstatechange = () => {
        setRemoteStreams((currentStreams) => {
          const current = currentStreams[remoteUserId];

          if (!current) {
            return currentStreams;
          }

          return {
            ...currentStreams,
            [remoteUserId]: {
              ...current,
              connectionState: connection.connectionState,
            },
          };
        });
      };

      peerConnectionsRef.current[remoteUserId] = connection;
      return connection;
    },
    [sendSignal],
  );

  const createOfferForUser = useCallback(
    async (remoteUserId: string) => {
      const connection = ensurePeerConnection(remoteUserId);

      if (connection.signalingState !== "stable") {
        return;
      }

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendSignal("offer", { to: remoteUserId, description: connection.localDescription?.toJSON() });
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
      return stream;
    } catch (videoError) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      cameraStreamRef.current = stream;
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraOff(true);
      setCallStatusMessage(videoError instanceof Error ? `Camera unavailable. Joined with audio only: ${videoError.message}` : "Camera unavailable. Joined with audio only.");
      return stream;
    }
  }, []);

  const connectToCall = useCallback(
    async (call: EmployeeChatCall) => {
      if (!supabase) {
        return;
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

      await cleanupCall();
      setCallConnecting(true);
      setActiveCall(call);
      activeCallRef.current = call;
      setIncomingCall(null);
      setOpen(true);

      try {
        await acquireMeetingMedia();
      } catch (error) {
        await cleanupCall();
        setStatusMessage(error instanceof Error ? error.message : "Could not access your microphone or camera.");
        return;
      }

      const channel = supabase.channel(`employee-call:${call.id}`, {
        config: {
          private: true,
          broadcast: { ack: true },
          presence: { key: currentUser.id },
        },
      });

      callChannelRef.current = channel;

      channel
        .on("broadcast", { event: "offer" }, async ({ payload }: { payload: SignalPayload }) => {
          if (payload.call_id !== call.id || payload.to !== currentUser.id || payload.from === currentUser.id || !payload.description) {
            return;
          }

          const connection = ensurePeerConnection(payload.from);
          await connection.setRemoteDescription(new RTCSessionDescription(payload.description));
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await sendSignal("answer", { to: payload.from, description: connection.localDescription?.toJSON() });
        })
        .on("broadcast", { event: "answer" }, async ({ payload }: { payload: SignalPayload }) => {
          if (payload.call_id !== call.id || payload.to !== currentUser.id || payload.from === currentUser.id || !payload.description) {
            return;
          }

          const connection = peerConnectionsRef.current[payload.from];

          if (connection && connection.signalingState !== "stable") {
            await connection.setRemoteDescription(new RTCSessionDescription(payload.description));
          }
        })
        .on("broadcast", { event: "ice_candidate" }, async ({ payload }: { payload: SignalPayload }) => {
          if (payload.call_id !== call.id || payload.to !== currentUser.id || payload.from === currentUser.id || !payload.candidate) {
            return;
          }

          const connection = ensurePeerConnection(payload.from);
          await connection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        })
        .on("broadcast", { event: "media_state" }, ({ payload }: { payload: SignalPayload }) => {
          if (payload.call_id !== call.id || payload.from === currentUser.id) {
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

          if (payload.screen_sharing) {
            setChatExpanded(true);
          }
        })
        .on("broadcast", { event: "leave" }, ({ payload }: { payload: SignalPayload }) => {
          if (payload.call_id !== call.id || payload.from === currentUser.id) {
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
          if (payload.call_id === call.id && payload.from !== currentUser.id) {
            void cleanupCall();
          }
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState() as Record<string, CallPresencePayload[]>;
          const presentUserIds = Object.values(state)
            .flat()
            .map((presence) => presence.user_id)
            .filter((userId) => userId && userId !== currentUser.id);

          presentUserIds.forEach((userId) => {
            if (currentUser.id < userId) {
              void createOfferForUser(userId);
            }
          });
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              user_id: currentUser.id,
              display_name: getUserLabel(currentUser.id),
              joined_at: new Date().toISOString(),
            } satisfies CallPresencePayload);
            await sendSignal("call_accept", {});
            setCallConnecting(false);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setCallStatusMessage("Could not connect to the meeting channel.");
            setCallConnecting(false);
          }
        });
    },
    [acquireMeetingMedia, cleanupCall, createOfferForUser, currentUser.id, ensurePeerConnection, getUserLabel, sendSignal, supabase],
  );

  const clearChatNotifications = useCallback((force = false) => {
    if (!force && unreadChatCount === 0 && !latestNotificationTitle) {
      return;
    }

    setUnreadChatCount(0);
    setLatestNotificationTitle("");
    void markChatNotificationsRead()
      .then(() => router.refresh())
      .catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : "Could not update chat notifications.");
      });
  }, [latestNotificationTitle, router, unreadChatCount]);

  const markLastSeen = useCallback(() => {
    if (!supabase) {
      return;
    }

    void supabase.rpc("mark_employee_last_seen").then(({ error }) => {
      if (error) {
        console.error("Could not update employee last seen timestamp.", error);
      }
    });
  }, [supabase]);

  useEffect(() => {
    markLastSeen();

    const intervalId = window.setInterval(markLastSeen, 5 * 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markLastSeen();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [markLastSeen]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const presenceKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `${currentUser.id}-${crypto.randomUUID()}`
        : `${currentUser.id}-${Date.now()}`;
    const channel = supabase.channel("employee-presence", {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });
    const updatePresence = () => {
      const state = channel.presenceState() as Record<string, PresencePayload[]>;
      const nextOnlineUserIds = new Set<string>();

      Object.values(state).forEach((presences) => {
        presences.forEach((presence) => {
          if (presence.user_id) {
            nextOnlineUserIds.add(presence.user_id);
          }
        });
      });

      setOnlineUserIds(nextOnlineUserIds);
    };

    channel
      .on("presence", { event: "sync" }, updatePresence)
      .on("presence", { event: "join" }, updatePresence)
      .on("presence", { event: "leave" }, updatePresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: currentUser.id,
            display_name: getProfileName(currentUserProfile) || currentUser.displayName,
            email: currentUser.email,
            online_at: new Date().toISOString(),
          } satisfies PresencePayload);
        }
      });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [currentUser.displayName, currentUser.email, currentUser.id, currentUserProfile, supabase]);

  useEffect(() => {
    if (!open) {
      return;
    }

    clearChatNotifications();
  }, [clearChatNotifications, open]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("employee-chat-message-stream")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "employee_chat_messages",
        },
        (payload) => {
          const message = payload.new as EmployeeChatMessage;

          setMessagesByThread((currentMessages) => ({
            ...currentMessages,
            [message.thread_id]: mergeMessage(currentMessages[message.thread_id] ?? [], message),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`employee-chat-calls-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "employee_chat_calls",
        },
        (payload) => {
          const call = payload.new as EmployeeChatCall;

          if (call.created_by !== currentUser.id && call.status === "active") {
            setIncomingCall(call);
            setOpen(true);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "employee_chat_calls",
        },
        (payload) => {
          const call = payload.new as EmployeeChatCall;

          if (call.id === incomingCall?.id && call.status !== "active") {
            setIncomingCall(null);
          }

          if (call.id === activeCallRef.current?.id && call.status !== "active") {
            void cleanupCall();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "employee_chat_call_participants",
        },
        (payload) => {
          const participant = payload.new as EmployeeChatCallParticipant;

          if (participant.call_id === activeCallRef.current?.id) {
            setCallParticipants((currentParticipants) => mergeParticipant(currentParticipants, participant));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "employee_chat_call_participants",
        },
        (payload) => {
          const participant = payload.new as EmployeeChatCallParticipant;

          if (participant.call_id === activeCallRef.current?.id) {
            setCallParticipants((currentParticipants) => mergeParticipant(currentParticipants, participant));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cleanupCall, currentUser.id, incomingCall?.id, supabase]);

  useEffect(() => {
    if (!incomingCall || incomingCall.id === lastIncomingCallToneRef.current) {
      return;
    }

    lastIncomingCallToneRef.current = incomingCall.id;
    void playIncomingCallTone(incomingCallAudioRef).catch(() => undefined);

    if (incomingCallRingIntervalRef.current) {
      window.clearInterval(incomingCallRingIntervalRef.current);
    }

    incomingCallRingIntervalRef.current = window.setInterval(() => {
      void playIncomingCallTone(incomingCallAudioRef).catch(() => undefined);
    }, 1600);

    return () => {
      if (incomingCallRingIntervalRef.current) {
        window.clearInterval(incomingCallRingIntervalRef.current);
        incomingCallRingIntervalRef.current = null;
      }
    };
  }, [incomingCall]);

  useEffect(() => {
    const unlockAudio = () => {
      void primeIncomingCallAudio(incomingCallAudioRef).catch(() => undefined);
    };

    window.addEventListener("pointerdown", unlockAudio, { capture: true });
    window.addEventListener("keydown", unlockAudio, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio, { capture: true });
      window.removeEventListener("keydown", unlockAudio, { capture: true });

      if (incomingCallRingIntervalRef.current) {
        window.clearInterval(incomingCallRingIntervalRef.current);
      }

      void incomingCallAudioRef.current?.close().catch(() => undefined);
      incomingCallAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (incomingCall) {
      return;
    }

    if (incomingCallRingIntervalRef.current) {
      window.clearInterval(incomingCallRingIntervalRef.current);
      incomingCallRingIntervalRef.current = null;
    }
  }, [incomingCall]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`employee-chat-notifications-${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "portal_notifications",
          filter: `recipient_user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const notification = payload.new as PortalNotification;

          if (notification.source_type !== "employee_chat_message" || notification.status !== "unread") {
            return;
          }

          if (open) {
            clearChatNotifications(true);
            return;
          }

          setUnreadChatCount((count) => count + 1);
          setLatestNotificationTitle(notification.title);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "portal_notifications",
          filter: `recipient_user_id=eq.${currentUser.id}`,
        },
        (payload) => {
          const oldNotification = payload.old as Partial<PortalNotification>;
          const notification = payload.new as PortalNotification;

          if (notification.source_type !== "employee_chat_message") {
            return;
          }

          if (oldNotification.status === "unread" && notification.status !== "unread") {
            setUnreadChatCount((count) => Math.max(0, count - 1));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clearChatNotifications, currentUser.id, open, supabase]);

  useEffect(() => {
    if (open) {
      messageEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [activeMessages.length, open, activeThread?.id]);

  useEffect(
    () => () => {
      void cleanupCall();
    },
    [cleanupCall],
  );

  async function loadMessages(threadId: string) {
    if (!supabase || messagesByThread[threadId]) {
      return;
    }

    setLoadingThreadId(threadId);
    const { data, error } = await supabase
      .from("employee_chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(80);

    setLoadingThreadId("");

    if (error) {
      setStatusMessage(error.message);
      return;
    }

    setMessagesByThread((currentMessages) => ({
      ...currentMessages,
      [threadId]: [...(data ?? [])].reverse() as EmployeeChatMessage[],
    }));
  }

  async function openDirectThread(recipientUserId: string) {
    setActiveTab("direct");
    setSelectedRecipientId(recipientUserId);
    setStatusMessage("");

    if (directThreads[recipientUserId]) {
      await loadMessages(directThreads[recipientUserId].id);
      return;
    }

    setLoadingThreadId(recipientUserId);

    try {
      const thread = await ensureDirectThread(recipientUserId);
      setDirectThreads((currentThreads) => ({ ...currentThreads, [recipientUserId]: thread }));
      await loadMessages(thread.id);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not open chat.");
    } finally {
      setLoadingThreadId("");
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeThread || sending) {
      return;
    }

    setSending(true);
    setStatusMessage("");

    try {
      const message = await sendChatMessage(activeThread.id, draft);
      setDraft("");
      setMessagesByThread((currentMessages) => ({
        ...currentMessages,
        [message.thread_id]: mergeMessage(currentMessages[message.thread_id] ?? [], message),
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleStartCall() {
    if (!activeThread || activeCall || callConnecting) {
      return;
    }

    setCallStatusMessage("");
    setCallConnecting(true);

    try {
      const result = await startChatCall(activeThread.id);
      setCallParticipants(result.participants);
      await connectToCall(result.call);
    } catch (error) {
      setCallConnecting(false);
      setStatusMessage(error instanceof Error ? error.message : "Could not start the meeting.");
    }
  }

  async function handleJoinCall() {
    if (!incomingCall || activeCall || callConnecting) {
      return;
    }

    setCallStatusMessage("");
    setCallConnecting(true);

    try {
      const result = await joinChatCall(incomingCall.id);
      await setLoadedDirectThread(result.thread);
      setCallParticipants(result.participants);
      await loadMessages(result.thread.id);
      await connectToCall(result.call);
    } catch (error) {
      setCallConnecting(false);
      setStatusMessage(error instanceof Error ? error.message : "Could not join the meeting.");
    }
  }

  async function handleDeclineCall() {
    if (!incomingCall) {
      return;
    }

    try {
      await declineChatCall(incomingCall.id);
      setIncomingCall(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not decline the meeting.");
    }
  }

  async function handleEndCall() {
    if (!activeCall) {
      return;
    }

    try {
      await sendSignal("end", {});
      await endChatCall(activeCall.id);
    } catch (error) {
      setCallStatusMessage(error instanceof Error ? error.message : "Could not end the meeting.");
    } finally {
      await cleanupCall();
    }
  }

  async function handleLeaveCall() {
    await sendSignal("leave", {});
    await cleanupCall({ notifyServer: true });
  }

  function toggleMute() {
    const nextMuted = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
    updateParticipantMedia({
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
    updateParticipantMedia({
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
    updateParticipantMedia({
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
      setCallStatusMessage("This browser does not support screen sharing.");
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
      setChatExpanded(true);
      updateParticipantMedia({
        audio_enabled: !muted,
        video_enabled: true,
        screen_sharing: true,
      });
    } catch (error) {
      setCallStatusMessage(error instanceof Error ? error.message : "Could not start screen sharing.");
    }
  }

  if (!supabase || !companyThread) {
    return null;
  }

  return (
    <div className={`employee-chat-shell${open ? " employee-chat-shell-open" : ""}`}>
      <button className="employee-chat-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-label="Open employee chat">
        <MessageCircle size={21} />
        {toggleBadgeCount > 0 ? (
          <span className={unreadChatCount > 0 ? "employee-chat-unread-count" : "employee-chat-online-count"}>
            {toggleBadgeCount > 99 ? "99+" : toggleBadgeCount}
          </span>
        ) : null}
      </button>
      {latestNotificationTitle && !open ? (
        <button
          className="employee-chat-toast"
          type="button"
          onClick={() => {
            setOpen(true);
            clearChatNotifications(true);
          }}
        >
          <Bell size={16} />
          <span>{latestNotificationTitle}</span>
        </button>
      ) : null}

      {open ? (
        <aside className={chatExpanded ? "employee-chat-drawer employee-chat-drawer-windowed" : "employee-chat-drawer"} aria-label="Employee chat">
          <div className="employee-chat-header">
            <div>
              <span className="eyebrow">Team Chat</span>
              <h2>{activeTab === "company" ? "Company Room" : selectedRecipient ? getProfileName(selectedRecipient) : "Direct Messages"}</h2>
            </div>
            <div className="employee-chat-header-actions">
              <button
                type="button"
                className="icon-button employee-chat-window-button"
                onClick={() => setChatExpanded((value) => !value)}
                aria-label={chatExpanded ? "Restore chat window" : "Expand chat window"}
              >
                {chatExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button
                type="button"
                className="icon-button employee-chat-call-button"
                onClick={() => void handleStartCall()}
                disabled={!activeThread || Boolean(activeCall) || callConnecting || (activeTab === "direct" && !selectedRecipient)}
                aria-label="Start meeting call"
              >
                <Phone size={18} />
              </button>
              <button type="button" className="icon-button employee-chat-close" onClick={() => setOpen(false)} aria-label="Close employee chat">
                <X size={18} />
              </button>
            </div>
          </div>

          {incomingCall ? (
            <div className="employee-call-incoming" role="status">
              <div>
                <strong>Incoming meeting</strong>
                <span>{incomingCallerName} is calling this chat.</span>
                <span>Started {formatChatTimestamp(incomingCall.created_at ?? "")}</span>
              </div>
              <div>
                <button className="button button-primary" type="button" onClick={() => void handleJoinCall()} disabled={callConnecting}>
                  <Phone size={16} />
                  Join
                </button>
                <button className="button button-secondary employee-call-decline" type="button" onClick={() => void handleDeclineCall()}>
                  <PhoneOff size={16} />
                  Decline
                </button>
              </div>
            </div>
          ) : null}

          {activeCall ? (
            <section className={screenShareActive ? "employee-call-tray employee-call-tray-screen-share" : "employee-call-tray"} aria-label="Active meeting call">
              <div className="employee-call-stage">
                <StreamTile
                  featured={screenSharing}
                  label="You"
                  muted
                  sharingPlaceholder={screenSharing && hideLocalScreenPreview}
                  state={`${muted ? "Muted" : "Mic on"}${screenSharing ? " - Sharing screen" : cameraOff ? " - Camera off" : ""}`}
                  stream={screenSharing && hideLocalScreenPreview ? null : localStream}
                />
                {Object.entries(remoteStreams).map(([userId, remote]) => (
                  <StreamTile
                    featured={remote.screenSharing}
                    key={userId}
                    label={getUserLabel(userId)}
                    state={`${remote.audioEnabled ? "Mic on" : "Muted"}${remote.screenSharing ? " - Sharing screen" : remote.videoEnabled ? "" : " - Camera off"}`}
                    stream={remote.stream}
                  />
                ))}
              </div>
              <div className="employee-call-controls">
                <span>{callConnecting ? "Connecting..." : `${callParticipantCount} in call - started ${formatChatTimestamp(activeCall.created_at ?? "")}`}</span>
                <button className={muted ? "active" : undefined} type="button" onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>
                  {muted ? <MicOff size={17} /> : <Mic size={17} />}
                </button>
                <button className={cameraOff ? "active" : undefined} type="button" onClick={toggleCamera} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}>
                  {cameraOff ? <VideoOff size={17} /> : <Video size={17} />}
                </button>
                <button
                  className={screenSharing ? "active" : undefined}
                  type="button"
                  onClick={() => void toggleScreenShare()}
                  aria-label={screenSharing ? "Stop sharing screen" : "Share screen"}
                >
                  {screenSharing ? <ScreenShareOff size={17} /> : <ScreenShare size={17} />}
                </button>
                <button className="employee-call-end" type="button" onClick={() => void handleEndCall()} aria-label="End meeting for everyone">
                  <PhoneOff size={17} />
                </button>
                <button type="button" onClick={() => void handleLeaveCall()}>
                  Leave
                </button>
              </div>
              {callStatusMessage ? <div className="employee-call-status">{callStatusMessage}</div> : null}
              <div className="employee-call-participants">
                {callParticipants.map((participant) => (
                  <span key={participant.id}>
                    {getUserLabel(participant.user_id)} - {participant.status}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <div className="employee-chat-tabs" role="tablist" aria-label="Chat views">
            <button
              className={activeTab === "company" ? "active" : undefined}
              type="button"
              onClick={() => {
                setActiveTab("company");
                setStatusMessage("");
              }}
            >
              <Users size={16} />
              Company
            </button>
            <button
              className={activeTab === "direct" ? "active" : undefined}
              type="button"
              onClick={() => {
                setActiveTab("direct");
                setStatusMessage("");
              }}
            >
              <MessageCircle size={16} />
              Direct
            </button>
          </div>

          <div className="employee-chat-body">
            <section className="employee-chat-people" aria-label="Active employees">
              <div className="employee-chat-people-head">
                <strong>{activeTab === "company" ? "Online now" : "Employees"}</strong>
                <span>{onlineCount}</span>
              </div>
              <div className="employee-chat-people-list">
                {activeProfiles.length === 0 ? (
                  <div className="employee-chat-empty">No active employees found.</div>
                ) : (
                  activeProfiles.map((profile) => {
                    const online = onlineUserIds.has(profile.user_id);
                    const selected = selectedRecipientId === profile.user_id && activeTab === "direct";

                    return (
                      <button
                        className={selected ? "employee-chat-person active" : "employee-chat-person"}
                        type="button"
                        key={profile.user_id}
                        onClick={() => void openDirectThread(profile.user_id)}
                      >
                        <span className={online ? "presence-dot presence-dot-online" : "presence-dot"} />
                        <span>
                          <strong>{getProfileName(profile)}</strong>
                          <small>{profile.team || profile.role.replace("_", " ")}</small>
                        </span>
                        {online ? <Radio size={14} /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="employee-chat-conversation" aria-label="Messages">
              <div className="employee-chat-thread-space">
                {statusMessage ? <div className="employee-chat-status">{statusMessage}</div> : null}
                {activeTab === "direct" && !selectedRecipient ? (
                  <div className="employee-chat-empty">Choose an employee.</div>
                ) : loadingThreadId === activeThread?.id || loadingThreadId === selectedRecipientId ? (
                  <div className="employee-chat-empty">Loading chat.</div>
                ) : activeMessages.length === 0 ? (
                  <div className="employee-chat-empty">No messages yet.</div>
                ) : (
                  <div className="employee-chat-message-list">
                    {activeMessages.map((message) => {
                      const mine = message.sender_user_id === currentUser.id;
                      const sender = message.sender_user_id ? profileByUserId.get(message.sender_user_id) : undefined;

                      return (
                        <article className={mine ? "employee-chat-message mine" : "employee-chat-message"} key={message.id}>
                          <div>
                            <strong>{mine ? "You" : getProfileName(sender)}</strong>
                            <span>{formatChatTimestamp(message.created_at ?? "")}</span>
                          </div>
                          <p>{message.body}</p>
                        </article>
                      );
                    })}
                    <div ref={messageEndRef} />
                  </div>
                )}
              </div>

              <form className="employee-chat-composer" onSubmit={handleSend}>
                <textarea
                  aria-label="Message"
                  disabled={!activeThread || sending}
                  maxLength={2000}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!activeThread || sending || draft.trim().length === 0) {
                        return;
                      }

                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Message..."
                  value={draft}
                />
                <button className="button button-primary" disabled={!activeThread || sending || draft.trim().length === 0} type="submit" aria-label="Send message">
                  <Send size={17} />
                </button>
              </form>
            </section>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
