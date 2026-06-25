import { useEffect, useState } from "react";
import type { Activity } from "../api";

export function usePodcastPlayer() {
  const [playingPodcast, setPlayingPodcast] = useState<Activity | null>(null);
  const [progress, setProgress] = useState(0);

  // Simulate podcast playback progress.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (playingPodcast) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setPlayingPodcast(null);
            return 0;
          }
          return prev + 1;
        });
      }, 300); // Speed up for demo purposes
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [playingPodcast]);

  const togglePlay = (act: Activity) => {
    if (playingPodcast?.title === act.title) {
      setPlayingPodcast(null); // Toggle off
    } else {
      setPlayingPodcast(act);
      setProgress(0);
    }
  };

  const stop = () => setPlayingPodcast(null);

  return { playingPodcast, progress, togglePlay, stop };
}
