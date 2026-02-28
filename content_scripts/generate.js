(() => {
  if (window.hasRun) {
    return;
  }
  window.hasRun = true;

  console.log("x-gif-dl content script loaded");

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "generate") {
      try {
        const videos = document.querySelectorAll("video");

        if (videos.length === 0) {
          sendResponse({
            success: false,
            error: "No videos found on this page",
          });
          return;
        }

        const video = videos[0];
        let videoUrl = video.src || video.currentSrc;

        if (!videoUrl) {
          const sources = video.querySelectorAll("source");
          if (sources.length > 0) {
            videoUrl = sources[0].src;
          }
        }

        if (!videoUrl) {
          sendResponse({ success: false, error: "Could not find video URL" });
          return;
        }

        console.log("Found video URL:", videoUrl);
        sendResponse({ success: true, videoUrl: videoUrl });
      } catch (error) {
        console.error("Error in generate command:", error);
        sendResponse({ success: false, error: error.message });
      }
    }

    return true;
  });
})();
