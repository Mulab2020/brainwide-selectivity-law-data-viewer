(function () {
  "use strict";

  const defaultSelection = {
    stimType: "ethological_cues",
    fishName: "5-3",
    stimId: 2
  };
  const appData = window.APP_DATA || { figs: [], stims: {} };
  const stimIntervalData = window.APP_STIM_INTERVALS || { by_fish_id: {} };
  const swimData = window.APP_SWIM_DATA || { by_fish_id: {} };
  const stimTypeOrder = [
    "natural_scenes",
    "noise",
    "localized_spots",
    "oriented_gratings",
    "ethological_cues"
  ];
  const stimTypeIds = {
    natural_scenes: 1,
    noise: 2,
    localized_spots: 3,
    oriented_gratings: 4,
    ethological_cues: 5
  };
  // Centralized stim theme colors for quick edits.
  // `fill` is the main button fill color.
  // `dark` is the darker variant used for borders and text.
  const themeMap = {
    natural_scenes: { fill: "#8ccb67", dark: "#567d40" },
    noise: { fill: "#9cabe8", dark: "#555d7d" },
    localized_spots: { fill: "#e8c021", dark: "#7a6512" },
    oriented_gratings: { fill: "#ca5146", dark: "#6e2c26" },
    ethological_cues: { fill: "#4f916b", dark: "#284a36" }
  };
  const uiLabels = {
    natural_scenes: "natural scenes",
    noise: "noise",
    localized_spots: "localized spots",
    oriented_gratings: "oriented gratings",
    ethological_cues: "ethological cues"
  };
  const viewLimits = {
    x: { minScale: 1, maxScale: 8 },
    y: { minScale: 1, maxScale: 8 }
  };
  const swimOverlayAlpha = 0.35;
  const runtimePaths = {
    rastermap: (fishId) => `resources/rastermaps/fish${fishId}.png`,
    devFishDir: (fishId) => `.dev/resources/figs/fish${fishId}`
  };
  const defaultViewState = {
    x: { offset: 0, scale: 1 },
    y: { offset: 0, scale: 1 }
  };

  const state = {
    currentStimType: "",
    currentFishId: null,
    currentFishName: "",
    currentStimId: null,
    viewStateX: { ...defaultViewState.x },
    viewStateY: { ...defaultViewState.y },
    stimSelectorScrollState: 0
  };

  const figureState = {
    rasterReady: false,
    interaction: null,
    currentFishIntervals: null,
    currentOverlayData: null,
    currentFishSwim: null,
    layoutObserver: null
  };

  const refs = {
    statusBanner: document.getElementById("statusBanner"),
    mainColumn: document.getElementById("mainColumn"),
    fishPanel: document.getElementById("fishPanel"),
    selectorPanel: document.getElementById("selectorPanel"),
    figurePanel: document.getElementById("figurePanel"),
    stimPanel: document.getElementById("stimPanel"),
    fishTitle: document.getElementById("fishTitle"),
    stimTypeList: document.getElementById("stimTypeList"),
    fishList: document.getElementById("fishList"),
    fishPrevButton: document.getElementById("fishPrevButton"),
    fishNextButton: document.getElementById("fishNextButton"),
    imageStageShell: document.getElementById("imageStageShell"),
    imageStage: document.getElementById("imageStage"),
    imageViewport: document.getElementById("imageViewport"),
    intervalOverlay: document.getElementById("intervalOverlay"),
    intervalMarkerStrip: document.getElementById("intervalMarkerStrip"),
    rasterImage: document.getElementById("rasterImage"),
    rasterPlaceholder: document.getElementById("rasterPlaceholder"),
    stimOverlay: document.getElementById("stimOverlay"),
    swimStage: document.getElementById("swimStage"),
    swimCanvas: document.getElementById("swimCanvas"),
    swimImage: document.getElementById("swimImage"),
    swimEmpty: document.getElementById("swimEmpty"),
    neuronLabel: document.getElementById("neuronLabel"),
    timeLabel: document.getElementById("timeLabel"),
    yAxisTrack: document.getElementById("yAxisTrack"),
    xAxisTrack: document.getElementById("xAxisTrack"),
    ySliderThumb: document.getElementById("ySliderThumb"),
    xSliderThumb: document.getElementById("xSliderThumb"),
    stimGallery: document.getElementById("stimGallery"),
    resetViewButton: document.getElementById("resetViewButton"),
    locateStimButton: document.getElementById("locateStimButton"),
    stimPrevButton: document.getElementById("stimPrevButton"),
    stimNextButton: document.getElementById("stimNextButton"),
    swimPanel: document.getElementById("swimPanel"),
  };

  const fishes = Array.isArray(appData.figs) ? appData.figs.slice() : [];
  const stims = appData.stims && typeof appData.stims === "object" ? appData.stims : {};
  const fishById = new Map(fishes.map((fish) => [fish.fish_id, fish]));
  const fishByStimType = stimTypeOrder.reduce((acc, stimType) => {
    acc[stimType] = fishes.filter((fish) => fish.stim_type === stimType);
    return acc;
  }, {});

  init();

  function init() {
    if (!fishes.length || !Object.keys(stims).length) {
      showStatus("Missing local configuration. Please check resources/data.js.");
      return;
    }

    const initialStimType = defaultSelection.stimType;
    const initialFish =
      fishByStimType[initialStimType]?.find((fish) => fish.fish_name === defaultSelection.fishName) ||
      getDefaultFishForStimType(initialStimType);

    if (!initialFish) {
      showStatus("No fish data is available for the current dataset.");
      return;
    }

    bindEvents();
    applyFishSelection(initialFish, { resetStim: true, resetView: true, syncStimType: true });

    if (state.currentStimType === defaultSelection.stimType && state.currentFishName === defaultSelection.fishName) {
      setStimulus(defaultSelection.stimId);
    }
  }

  function bindEvents() {
    refs.resetViewButton.addEventListener("click", resetView);
    refs.locateStimButton.addEventListener("click", locateCurrentStim);
    refs.stimPrevButton.addEventListener("click", () => scrollStimGalleryBy(-1));
    refs.stimNextButton.addEventListener("click", () => scrollStimGalleryBy(1));
    refs.stimGallery.addEventListener("scroll", syncStimScrollState);
    refs.stimGallery.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      event.preventDefault();
      refs.stimGallery.scrollBy({ left: event.deltaY, behavior: "smooth" });
    }, { passive: false });

    refs.imageStage.addEventListener("pointerdown", beginStagePan);
    refs.imageStage.addEventListener("wheel", onImageStageWheel, { passive: false });

    refs.xSliderThumb.addEventListener("pointerdown", (event) => beginScrollbarDrag(event, "x"));
    refs.ySliderThumb.addEventListener("pointerdown", (event) => beginScrollbarDrag(event, "y"));

    refs.fishPrevButton.addEventListener("click", () => scrollFishListBy(-1));
    refs.fishNextButton.addEventListener("click", () => scrollFishListBy(1));
    refs.fishList.addEventListener("scroll", updateFishArrows);

    refs.fishList.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return;
      }
      event.preventDefault();
      refs.fishList.scrollBy({ top: event.deltaY, behavior: "smooth" });
    }, { passive: false });

    setupLayoutObserver();
    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", endPointerInteraction);
    window.addEventListener("pointercancel", endPointerInteraction);
    window.addEventListener("resize", onWindowResize);
  }

  function onWindowResize() {
    syncFishPanelHeight();
    updateGalleryArrows();
    renderFigureView();
  }

  function setStimType(stimType) {
    const fish = getDefaultFishForStimType(stimType);
    if (!fish) {
      showStatus("No fish found for the selected stimulus type.");
      return;
    }

    applyFishSelection(fish, { resetStim: true, resetView: true, syncStimType: true });
  }

  function applyFishSelection(fish, options) {
    state.currentStimType = options.syncStimType ? fish.stim_type : state.currentStimType;
    state.currentFishId = fish.fish_id;
    state.currentFishName = fish.fish_name || String(fish.fish_id);
    state.currentStimId = options.resetStim ? null : state.currentStimId;
    if (options.resetStim) {
      state.stimSelectorScrollState = 0;
    }

    if (options.resetView) {
      resetViewStateOnly();
    }

    cancelPointerInteraction();
    hideStatus();
    renderStimTypeSelector();
    renderFishSelector();
    renderStimSelector();
    renderFigure();
    syncFishPanelHeight();
  }

  function setStimulus(stimId) {
    state.currentStimId = stimId;
    renderStimSelector();
    renderStimOverlay();
    renderFigureView();
  }

  function renderStimTypeSelector() {
    refs.stimTypeList.innerHTML = "";

    stimTypeOrder.forEach((stimType) => {
      const button = document.createElement("button");
      const theme = themeMap[stimType];
      button.className = "stim-type-button";
      button.type = "button";
      button.textContent = uiLabels[stimType] || stimType;
      button.style.background = theme ? toRgba(theme.fill, 0.25) : "";
      button.style.borderColor = theme ? toRgba(theme.dark, 0.25) : "";
      button.style.color = theme ? theme.dark : "";

      if (stimType === state.currentStimType) {
        button.classList.add("is-active");
        button.style.background = theme ? theme.fill : "";
        button.style.borderColor = theme ? theme.dark : "";
        button.style.color = "#ffffff";
        button.style.fontWeight = "700";
      } else {
        button.style.fontWeight = "400";
      }

      button.addEventListener("click", () => setStimType(stimType));
      refs.stimTypeList.appendChild(button);
    });
  }

  function renderFishSelector() {
    refs.fishList.innerHTML = "";

    const group = fishes;
    const theme = themeMap[state.currentStimType];
    group.forEach((fish) => {
      const button = document.createElement("button");
      button.className = "fish-item";
      button.type = "button";
      button.textContent = fish.fish_name || String(fish.fish_id);
      button.dataset.fishId = String(fish.fish_id);

      if (fish.fish_id === state.currentFishId) {
        button.classList.add("is-active");
        button.style.background = theme ? theme.fill : "";
        button.style.color = "#ffffff";
        button.style.boxShadow = "none";
      }

      button.addEventListener("click", () => applyFishSelection(fish, { resetStim: true, resetView: true, syncStimType: true }));
      refs.fishList.appendChild(button);
    });

    const activeFish = refs.fishList.querySelector(".fish-item.is-active");
    if (activeFish) {
      activeFish.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    } else {
      updateFishArrows();
    }
    requestAnimationFrame(updateFishArrows);
  }

  function renderStimSelector() {
    refs.stimGallery.innerHTML = "";
    const currentStimList = getCurrentStimList();
    const theme = themeMap[state.currentStimType];

    currentStimList.forEach((stim, index) => {
      const stimId = index + 1;
      const card = document.createElement("button");
      card.className = "stim-card";
      card.type = "button";
      card.dataset.stimId = String(stimId);
      card.style.color = theme ? theme.dark : "";
      card.style.setProperty("--stim-accent", theme ? theme.fill : "currentColor");

      if (state.currentStimId === stimId) {
        card.classList.add("is-active");
        // card.style.color = "#ffffff";
      }

      const thumb = document.createElement("img");
      thumb.alt = stim.name || `Stim ${stimId}`;
      thumb.src = stim.demo || "";
      thumb.loading = "lazy";
      thumb.addEventListener("error", () => {
        const fallback = document.createElement("div");
        fallback.className = "stim-thumb-fallback";
        fallback.textContent = "Missing demo";
        thumb.replaceWith(fallback);
      }, { once: true });

      const label = document.createElement("span");
      label.textContent = stim.name || `Stim ${stimId}`;

      card.appendChild(thumb);
      card.appendChild(label);
      card.addEventListener("click", () => setStimulus(stimId));
      refs.stimGallery.appendChild(card);
    });

    refs.locateStimButton.disabled = state.currentStimId == null;
    updateGalleryArrows();

    if (state.currentStimId != null) {
      requestAnimationFrame(() => locateCurrentStim(false));
    } else {
      refs.stimGallery.scrollLeft = state.stimSelectorScrollState;
    }
  }

  function renderFigure() {
    const fish = fishById.get(state.currentFishId);
    if (!fish) {
      showStatus("Selected fish could not be resolved.");
      return;
    }

    refs.neuronLabel.textContent = `Neurons (${formatInteger(fish.n_neuron)} in total)`;
    refs.timeLabel.textContent = `Time (${Math.round(Number(fish.time_len) || 0)} minutes in total)`;
    figureState.currentFishIntervals = stimIntervalData.by_fish_id[String(fish.fish_id)] || null;
    figureState.currentFishSwim = swimData.by_fish_id[String(fish.fish_id)] || null;

    const devFishPath = runtimePaths.devFishDir(fish.fish_id);
    setRasterImage(runtimePaths.rastermap(fish.fish_id));
    renderStimOverlay();
    renderSwimPanel(`${devFishPath}/swim.png`);
    renderFigureView();
  }

  function renderStimOverlay() {
    const fish = fishById.get(state.currentFishId);
    if (!fish || state.currentStimId == null) {
      figureState.currentOverlayData = null;
      clearIntervalOverlay();
      clearIntervalMarkers();
      refs.stimOverlay.classList.add("hidden");
      refs.stimOverlay.removeAttribute("src");
      return;
    }

    const intervalEntry = figureState.currentFishIntervals;
    const stimIntervals = intervalEntry && Array.isArray(intervalEntry.stim_intervals)
      ? intervalEntry.stim_intervals[state.currentStimId - 1]
      : null;
    const nFrame = Number(fish.n_frame || (intervalEntry && intervalEntry.n_frame) || 0);
    const theme = themeMap[state.currentStimType];

    if (Array.isArray(stimIntervals) && nFrame > 0) {
      figureState.currentOverlayData = {
        stimIntervals: stimIntervals,
        nFrame: nFrame,
        fillColor: theme ? theme.fill : "#9cabe8"
      };
      renderIntervalOverlay(stimIntervals, nFrame, theme ? theme.fill : "#9cabe8");
      renderIntervalMarkers();
      refs.stimOverlay.classList.add("hidden");
      refs.stimOverlay.removeAttribute("src");
      return;
    }

    figureState.currentOverlayData = null;
    clearIntervalOverlay();
    clearIntervalMarkers();
    const overlaySrc = `${runtimePaths.devFishDir(fish.fish_id)}/stim${state.currentStimId}.png`;
    refs.stimOverlay.classList.add("hidden");
    refs.stimOverlay.onerror = function () {
      refs.stimOverlay.classList.add("hidden");
      console.warn(`Missing stimulus overlay: ${overlaySrc}`);
    };
    refs.stimOverlay.onload = function () {
      refs.stimOverlay.classList.remove("hidden");
      renderFigureView();
    };
    refs.stimOverlay.src = overlaySrc;
  }

  function renderIntervalOverlay(stimIntervals, nFrame, fillColor) {
    const svg = refs.intervalOverlay;
    const safeFrameCount = Math.max(1, Math.floor(nFrame));
    const heightUnits = 100;
    svg.setAttribute("viewBox", `0 0 ${safeFrameCount} ${heightUnits}`);

    if (!stimIntervals.length) {
      svg.innerHTML = "";
      svg.classList.add("hidden");
      return;
    }

    const overlayFill = toRgba(fillColor, 1);
    const rectMarkup = stimIntervals.map((pair) => {
      const onset = clamp(Number(pair[0]) || 0, 0, safeFrameCount);
      const offset = clamp(Number(pair[1]) || 0, onset, safeFrameCount);
      const width = Math.max(0, offset - onset);
      return `<rect x="${onset}" y="0" width="${width}" height="${heightUnits}" fill="${overlayFill}" shape-rendering="crispEdges"></rect>`;
    }).join("");

    svg.innerHTML = rectMarkup;
    svg.classList.remove("hidden");
  }

  function clearIntervalOverlay() {
    refs.intervalOverlay.innerHTML = "";
    refs.intervalOverlay.classList.add("hidden");
  }

  function renderIntervalMarkers() {
    const svg = refs.intervalMarkerStrip;
    const overlayData = figureState.currentOverlayData;
    if (!figureState.rasterReady || !overlayData || !overlayData.stimIntervals.length) {
      clearIntervalMarkers();
      return;
    }

    const stageWidth = refs.imageStage.clientWidth;
    if (!stageWidth) {
      clearIntervalMarkers();
      return;
    }

    const stripHeight = 8;
    const radius = 4;
    const scale = state.viewStateX.scale;
    const offset = state.viewStateX.offset;
    const nFrame = Math.max(1, overlayData.nFrame);
    const fill = overlayData.fillColor || "#9cabe8";

    svg.setAttribute("viewBox", `0 0 ${Math.max(stageWidth, 1)} ${stripHeight}`);

    const circles = overlayData.stimIntervals.map((pair) => {
      const onset = clamp(Number(pair[0]) || 0, 0, nFrame);
      const offsetFrame = clamp(Number(pair[1]) || 0, onset, nFrame);
      const markerFrame = (onset + offsetFrame) / 2;
      const normalized = markerFrame / nFrame;
      const x = (normalized - offset) * stageWidth * scale;
      return `<circle cx="${x}" cy="${stripHeight - radius}" r="${radius}" fill="${fill}" shape-rendering="geometricPrecision"></circle>`;
    }).join("");

    svg.innerHTML = circles;
    svg.classList.remove("hidden");
  }

  function clearIntervalMarkers() {
    refs.intervalMarkerStrip.innerHTML = "";
    refs.intervalMarkerStrip.classList.add("hidden");
  }

  function setRasterImage(src) {
    figureState.rasterReady = false;
    refs.rasterImage.classList.add("hidden");
    refs.imageViewport.classList.add("hidden");
    refs.rasterPlaceholder.classList.add("hidden");
    refs.imageStage.classList.add("is-disabled");

    refs.rasterImage.onerror = function () {
      figureState.rasterReady = false;
      refs.rasterImage.classList.add("hidden");
      refs.imageViewport.classList.add("hidden");
      refs.imageStage.classList.add("is-disabled");
      refs.rasterPlaceholder.textContent = "Rastermap image is missing for this fish.";
      refs.rasterPlaceholder.classList.remove("hidden");
      renderFigureView();
    };
    refs.rasterImage.onload = function () {
      figureState.rasterReady = true;
      refs.rasterImage.classList.remove("hidden");
      refs.imageViewport.classList.remove("hidden");
      refs.imageStage.classList.remove("is-disabled");
      refs.rasterPlaceholder.classList.add("hidden");
      renderFigureView();
    };
    refs.rasterImage.src = src;
  }

  function setSwimImage(src) {
    refs.swimCanvas.classList.add("hidden");
    refs.swimImage.classList.add("hidden");
    refs.swimEmpty.classList.remove("hidden");
    refs.swimEmpty.textContent = "";
    refs.swimImage.onerror = function () {
      refs.swimCanvas.classList.add("hidden");
      refs.swimImage.classList.add("hidden");
      refs.swimEmpty.classList.remove("hidden");
      refs.swimEmpty.textContent = "";
    };
    refs.swimImage.onload = function () {
      refs.swimCanvas.classList.add("hidden");
      refs.swimImage.classList.remove("hidden");
      refs.swimEmpty.classList.add("hidden");
    };
    refs.swimImage.src = src;
  }

  function renderSwimPanel(fallbackImageSrc) {
    const shouldShow = shouldRenderSwimTrace();

    refs.swimPanel.classList.toggle("hidden", !shouldShow);

    if (shouldShow) {
      refs.swimImage.classList.add("hidden");
      refs.swimEmpty.classList.add("hidden");
      refs.swimEmpty.textContent = "";
      renderSwimTrace();
    } else {
      refs.swimCanvas.classList.add("hidden");
      refs.swimImage.classList.add("hidden");
      refs.swimEmpty.classList.add("hidden");
      refs.swimEmpty.textContent = "";
    }

    syncFishPanelHeight();
    requestAnimationFrame(() => {
      renderFigureView();
    });
  }

  function shouldRenderSwimTrace() {
    const fish = fishById.get(state.currentFishId);
    if (!fish || fish.stim_type !== "ethological_cues") {
      return false;
    }

    const swimEntry = figureState.currentFishSwim;
    if (!swimEntry || !swimEntry.channels || !Object.keys(swimEntry.channels).length) {
      return false;
    }

    return Boolean(swimEntry.length_matches_n_frame);
  }

  function renderSwimTrace() {
    const swimEntry = figureState.currentFishSwim;
    if (!shouldRenderSwimTrace() || !swimEntry) {
      refs.swimCanvas.classList.add("hidden");
      return;
    }

    const channelEntries = Object.entries(swimEntry.channels);
    if (!channelEntries.length) {
      refs.swimCanvas.classList.add("hidden");
      return;
    }

    const canvas = refs.swimCanvas;
    const width = refs.swimStage.clientWidth;
    const height = refs.swimStage.clientHeight;
    if (!width || !height) {
      refs.swimCanvas.classList.add("hidden");
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      refs.swimCanvas.classList.add("hidden");
      return;
    }

    refs.swimCanvas.classList.remove("hidden");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    renderSwimIntervalOverlay(ctx, width, height, swimEntry.n_frame);
    const rowGap = channelEntries.length > 1 ? 6 : 0;
    const rowHeight = (height - rowGap * Math.max(0, channelEntries.length - 1)) / channelEntries.length;
    const visibleStart = Math.max(0, Math.floor(state.viewStateX.offset * swimEntry.n_frame) - 1);
    const visibleEnd = Math.min(
      swimEntry.n_frame,
      Math.ceil((state.viewStateX.offset + 1 / state.viewStateX.scale) * swimEntry.n_frame) + 1
    );

    channelEntries.forEach(([channelName, channel], index) => {
      const top = index * (rowHeight + rowGap);
      const minValue = Number(channel.min);
      const maxValue = Number(channel.max);
      const values = Array.isArray(channel.values) ? channel.values : [];
      const valueRange = maxValue - minValue;
      const innerTop = top + 3;
      const innerHeight = Math.max(1, rowHeight - 6);

      ctx.strokeStyle = "rgba(29, 105, 149, 0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, top + rowHeight - 0.5);
      ctx.lineTo(width, top + rowHeight - 0.5);
      ctx.stroke();

      if (!values.length || visibleEnd <= visibleStart) {
        return;
      }

      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();

      let hasPoint = false;
      for (let frameIndex = visibleStart; frameIndex < visibleEnd && frameIndex < values.length; frameIndex += 1) {
        const normalizedX = ((frameIndex + 0.5) / swimEntry.n_frame - state.viewStateX.offset) * state.viewStateX.scale;
        const x = normalizedX * width;
        const rawValue = Number(values[frameIndex]) || 0;
        const normalizedY = valueRange > 0 ? (rawValue - minValue) / valueRange : 0.5;
        const y = innerTop + (1 - normalizedY) * innerHeight;

        if (!hasPoint) {
          ctx.moveTo(x, y);
          hasPoint = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      if (hasPoint) {
        ctx.stroke();
      }
    });
  }

  function renderSwimIntervalOverlay(ctx, width, height, nFrame) {
    if (state.currentStimId == null || !figureState.currentFishIntervals) {
      return;
    }

    const stimIntervals = figureState.currentFishIntervals.stim_intervals?.[state.currentStimId - 1];
    if (!Array.isArray(stimIntervals) || !stimIntervals.length || !nFrame) {
      return;
    }

    const theme = themeMap[state.currentStimType] || { fill: "#9cabe8" };
    ctx.save();
    ctx.fillStyle = toRgba(theme.fill, swimOverlayAlpha);

    for (const pair of stimIntervals) {
      const onset = clamp(Number(pair[0]) || 0, 0, nFrame);
      const offset = clamp(Number(pair[1]) || 0, onset, nFrame);
      const startRatio = ((onset / nFrame) - state.viewStateX.offset) * state.viewStateX.scale;
      const endRatio = ((offset / nFrame) - state.viewStateX.offset) * state.viewStateX.scale;
      const x = startRatio * width;
      const rectWidth = (endRatio - startRatio) * width;

      if (rectWidth <= 0) {
        continue;
      }

      ctx.fillRect(x, 0, rectWidth, height);
    }

    ctx.restore();
  }

  function locateCurrentStim(useSmoothScroll) {
    if (state.currentStimId == null) {
      return;
    }

    const currentCard = refs.stimGallery.querySelector(`[data-stim-id="${state.currentStimId}"]`);
    if (!currentCard) {
      return;
    }

    currentCard.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: useSmoothScroll === false ? "auto" : "smooth"
    });
  }

  function scrollFishListBy(direction) {
    const firstItem = refs.fishList.querySelector(".fish-item");
    const step = firstItem ? firstItem.getBoundingClientRect().height + 6 : 42;
    refs.fishList.scrollBy({ top: direction * step * 2, behavior: "smooth" });
  }

  function updateFishArrows() {
    const maxScrollTop = refs.fishList.scrollHeight - refs.fishList.clientHeight;
    refs.fishPrevButton.disabled = refs.fishList.scrollTop <= 2;
    refs.fishNextButton.disabled = maxScrollTop <= 2 || refs.fishList.scrollTop >= maxScrollTop - 2;
  }

  function scrollStimGalleryBy(direction) {
    const firstCard = refs.stimGallery.querySelector(".stim-card");
    const step = firstCard ? firstCard.getBoundingClientRect().width + 12 : 120;
    refs.stimGallery.scrollBy({ left: direction * step * 2, behavior: "smooth" });
  }

  function syncStimScrollState() {
    state.stimSelectorScrollState = refs.stimGallery.scrollLeft;
    updateGalleryArrows();
  }

  function updateGalleryArrows() {
    const maxScrollLeft = refs.stimGallery.scrollWidth - refs.stimGallery.clientWidth;
    refs.stimPrevButton.disabled = refs.stimGallery.scrollLeft <= 2;
    refs.stimNextButton.disabled = maxScrollLeft <= 2 || refs.stimGallery.scrollLeft >= maxScrollLeft - 2;
  }

  function beginStagePan(event) {
    if (!figureState.rasterReady || event.button !== 0) {
      return;
    }

    event.preventDefault();
    figureState.interaction = {
      type: "pan",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: state.viewStateX.offset,
      startOffsetY: state.viewStateY.offset,
      stageWidth: refs.imageStage.clientWidth || 1,
      stageHeight: refs.imageStage.clientHeight || 1,
      startScaleX: state.viewStateX.scale,
      startScaleY: state.viewStateY.scale
    };
    refs.imageStage.classList.add("is-dragging");
  }

  function onImageStageWheel(event) {
    if (!figureState.rasterReady) {
      return;
    }

    event.preventDefault();
    const rect = refs.imageStage.getBoundingClientRect();
    const anchorX = clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    const anchorY = clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
    const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.08 : 0.0015));

    if (event.shiftKey && !event.altKey) {
      zoomAxisAtPoint("x", factor, anchorX);
    } else if (event.altKey) {
      zoomAxisAtPoint("y", factor, anchorY);
    } else {
      zoomAxisAtPoint("x", factor, anchorX);
      zoomAxisAtPoint("y", factor, anchorY);
    }

    renderFigureView();
  }

  function beginScrollbarDrag(event, axis) {
    if (!figureState.rasterReady || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const handle = event.target.closest(".scrollbar-handle");
    const action = handle ? `resize-${handle.dataset.edge}` : "move";
    const axisState = getAxisState(axis);
    const visible = 1 / axisState.scale;

    figureState.interaction = {
      type: "scrollbar",
      pointerId: event.pointerId,
      axis: axis,
      action: action,
      startClientCoord: axis === "x" ? event.clientX : event.clientY,
      startOffset: axisState.offset,
      startScale: axisState.scale,
      startEnd: axisState.offset + visible,
      trackLength: getTrackLength(axis)
    };
  }

  function handleGlobalPointerMove(event) {
    const interaction = figureState.interaction;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    if (interaction.type === "pan") {
      event.preventDefault();
      const deltaX = event.clientX - interaction.startClientX;
      const deltaY = event.clientY - interaction.startClientY;

      state.viewStateX.offset = interaction.startOffsetX - deltaX / (interaction.stageWidth * interaction.startScaleX);
      state.viewStateY.offset = interaction.startOffsetY - deltaY / (interaction.stageHeight * interaction.startScaleY);
      clampViewState("x");
      clampViewState("y");
      renderFigureView();
      return;
    }

    if (interaction.type === "scrollbar") {
      event.preventDefault();
      const axis = interaction.axis;
      const currentCoord = axis === "x" ? event.clientX : event.clientY;
      const deltaNorm = (currentCoord - interaction.startClientCoord) / Math.max(interaction.trackLength, 1);
      applyScrollbarDelta(axis, interaction, deltaNorm);
      renderFigureView();
    }
  }

  function endPointerInteraction(event) {
    const interaction = figureState.interaction;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }

    cancelPointerInteraction();
  }

  function cancelPointerInteraction() {
    figureState.interaction = null;
    refs.imageStage.classList.remove("is-dragging");
  }

  function applyScrollbarDelta(axis, interaction, deltaNorm) {
    const axisState = getAxisState(axis);
    const limits = viewLimits[axis];
    const minVisible = 1 / limits.maxScale;

    if (interaction.action === "move") {
      axisState.offset = interaction.startOffset + deltaNorm;
      axisState.scale = interaction.startScale;
      clampViewState(axis);
      return;
    }

    if (interaction.action === "resize-start") {
      const end = interaction.startEnd;
      const nextStart = clamp(interaction.startOffset + deltaNorm, 0, end - minVisible);
      axisState.offset = nextStart;
      axisState.scale = clamp(1 / Math.max(end - nextStart, minVisible), limits.minScale, limits.maxScale);
      clampViewState(axis);
      return;
    }

    if (interaction.action === "resize-end") {
      const start = interaction.startOffset;
      const nextEnd = clamp(interaction.startEnd + deltaNorm, start + minVisible, 1);
      axisState.offset = start;
      axisState.scale = clamp(1 / Math.max(nextEnd - start, minVisible), limits.minScale, limits.maxScale);
      clampViewState(axis);
    }
  }

  function zoomAxisAtPoint(axis, factor, anchorRatio) {
    const axisState = getAxisState(axis);
    const limits = viewLimits[axis];
    const oldScale = axisState.scale;
    const newScale = clamp(oldScale * factor, limits.minScale, limits.maxScale);

    if (Math.abs(newScale - oldScale) < 0.0001) {
      return;
    }

    const oldVisible = 1 / oldScale;
    const newVisible = 1 / newScale;
    const anchorInImage = axisState.offset + clamp(anchorRatio, 0, 1) * oldVisible;

    axisState.scale = newScale;
    axisState.offset = anchorInImage - clamp(anchorRatio, 0, 1) * newVisible;
    clampViewState(axis);
  }

  function renderFigureView() {
    clampViewState("x");
    clampViewState("y");

    if (figureState.rasterReady) {
      const stageWidth = refs.imageStage.clientWidth;
      const stageHeight = refs.imageStage.clientHeight;
      const transform = [
        `translate(${-state.viewStateX.offset * stageWidth * state.viewStateX.scale}px, ${-state.viewStateY.offset * stageHeight * state.viewStateY.scale}px)`,
        `scale(${state.viewStateX.scale}, ${state.viewStateY.scale})`
      ].join(" ");

      refs.imageViewport.style.transform = transform;
      refs.imageViewport.classList.remove("hidden");
      renderIntervalMarkers();
    } else {
      refs.imageViewport.style.transform = "";
      clearIntervalMarkers();
    }

    if (shouldRenderSwimTrace()) {
      renderSwimTrace();
    }

    renderScrollbar("x");
    renderScrollbar("y");
  }

  function renderScrollbar(axis) {
    const track = axis === "x" ? refs.xAxisTrack : refs.yAxisTrack;
    const thumb = axis === "x" ? refs.xSliderThumb : refs.ySliderThumb;
    const axisState = getAxisState(axis);
    const trackLength = getTrackLength(axis);
    const visible = 1 / axisState.scale;
    const size = Math.max(trackLength * visible, 0);
    const offset = trackLength * axisState.offset;

    if (axis === "x") {
      thumb.style.left = `${offset}px`;
      thumb.style.width = `${size}px`;
    } else {
      thumb.style.top = `${offset}px`;
      thumb.style.height = `${size}px`;
    }

    thumb.classList.toggle("hidden", !figureState.rasterReady);
  }

  function getTrackLength(axis) {
    const track = axis === "x" ? refs.xAxisTrack : refs.yAxisTrack;
    return axis === "x" ? track.clientWidth : track.clientHeight;
  }

  function getAxisState(axis) {
    return axis === "x" ? state.viewStateX : state.viewStateY;
  }

  function clampViewState(axis) {
    const axisState = getAxisState(axis);
    const limits = viewLimits[axis];
    axisState.scale = clamp(axisState.scale, limits.minScale, limits.maxScale);
    axisState.offset = clamp(axisState.offset, 0, Math.max(0, 1 - 1 / axisState.scale));
  }

  function resetViewStateOnly() {
    state.viewStateX = { ...defaultViewState.x };
    state.viewStateY = { ...defaultViewState.y };
  }

  function resetView() {
    resetViewStateOnly();
    renderFigureView();
  }

  function syncFishPanelHeight() {
    if (!refs.fishPanel || !refs.selectorPanel || !refs.figurePanel || !refs.stimPanel || !refs.fishTitle) {
      return;
    }

    const panelHeights = [
      refs.selectorPanel.getBoundingClientRect().height,
      refs.figurePanel.getBoundingClientRect().height,
      refs.stimPanel.getBoundingClientRect().height
    ];
    const computedStyle = refs.mainColumn ? window.getComputedStyle(refs.mainColumn) : null;
    const rowGap = parseFloat(computedStyle.rowGap || computedStyle.gap || "0") || 0;
    const contentHeight = panelHeights.reduce((sum, height) => sum + height, 0);
    const totalHeight = contentHeight + rowGap * Math.max(0, panelHeights.length - 1);

    if (totalHeight > 0) {
      refs.fishPanel.style.height = `${Math.round(totalHeight)}px`;
      const titleHeight = refs.fishTitle.getBoundingClientRect().height;
      const titleMarginBottom = parseFloat(window.getComputedStyle(refs.fishTitle).marginBottom || "0") || 0;
      const listTop = titleHeight + titleMarginBottom + 12;
      refs.fishPanel.style.setProperty("--fish-list-top", `${Math.max(24, Math.round(listTop))}px`);
    }
  }

  function setupLayoutObserver() {
    if (typeof ResizeObserver === "undefined" || figureState.layoutObserver) {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncFishPanelHeight();
    });

    [refs.selectorPanel, refs.figurePanel, refs.stimPanel].forEach((element) => {
      if (element) {
        observer.observe(element);
      }
    });

    figureState.layoutObserver = observer;
  }

  function getCurrentStimList() {
    const stimConfig = stims[state.currentStimType];
    return stimConfig && Array.isArray(stimConfig.stims) ? stimConfig.stims : [];
  }

  function getDefaultFishForStimType(stimType) {
    const targetFishName = `${stimTypeIds[stimType]}-1`;
    const group = fishByStimType[stimType] || [];
    return group.find((fish) => fish.fish_name === targetFishName) || group[0] || null;
  }

  function formatInteger(value) {
    const number = Number(value) || 0;
    return number.toLocaleString("en-US");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function showStatus(message) {
    refs.statusBanner.textContent = message;
    refs.statusBanner.classList.remove("hidden");
  }

  function hideStatus() {
    refs.statusBanner.textContent = "";
    refs.statusBanner.classList.add("hidden");
  }

  function toRgba(hexColor, alpha) {
    const normalized = String(hexColor || "").trim().replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return `rgba(156, 171, 232, ${alpha})`;
    }

    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function updateSwimPanelVisibility() {
    const shouldShow = shouldRenderSwimTrace();

    refs.swimPanel.classList.toggle("hidden", !shouldShow);

    syncFishPanelHeight();
    requestAnimationFrame(() => {
      renderFigureView();
    });
  }

})();




