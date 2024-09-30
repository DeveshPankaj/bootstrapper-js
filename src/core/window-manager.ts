import { draggable } from "@shared/draggable";
import { Command, Platform } from "@shared/index";
const platform = Platform.getInstance();

export const WINDOWS_CONTAINER_CLASS = "windows";
export const DESKTOP_CONTAINER_CLASS = "desktop";

export class WindowManager {
  private readonly windows: Record<
    string,
    Array<{ container: HTMLDivElement }>
  > = {};
  constructor(private contentRef: { current: HTMLDivElement | null }) {}

  public createWindow(command_name: string, ...args: unknown[]) {
    const command: Command = platform.host.getCommand(command_name)!;
    if (!command) {
      throw `Command not found [${command_name}]`;
    }

    const container = platform.window.document.createElement("div");
    const [head, closeButton, fullScreenButton, setTitle, appendActionButton, setHeaderStyles] =
      createWindoeHeader(command);

    // this.closeWindow(command)
    const windowRef = { container, command };
    this.windows[command.name] ??= [];
    this.windows[command.name].push(windowRef);
    Object.freeze(windowRef);

    // container.style.top = '3rem'
    container.setAttribute("data-name", command.name);
    container.classList.add("window");
    container.classList.add("hidden");

    container.appendChild(head);
    if (command.meta.fullScreen) {
      head.style.display = 'none'
    }
    const toggleHeader = (flag?:boolean) => {
      if(flag === undefined) head.style.display = head.style.display === 'none' ? '' : 'none'
      if(flag === true)head.style.display = ''
      if(flag === false)head.style.display = 'none'
    }

    const iframe = platform.window.document.createElement("iframe");
    iframe.classList.add("draggable");

    iframe.setAttribute("allowfullscreen", "");
    iframe.onload = () => {
      const iframeBody = iframe.contentWindow?.document?.body;
      if (!iframeBody) return;
      iframeBody.style.margin = "0";
      const hostDimention = {
        innerWidth: platform.window.innerWidth,
        innerHeight: platform.window.innerHeight,
      }

      platform.window.addEventListener('resize', () => {
        hostDimention.innerHeight = platform.window.innerHeight
        hostDimention.innerWidth = platform.window.innerWidth
      })

      command.exec(
        iframeBody,
        {
          close: () => this.closeWindow(windowRef),
          setTitle,
          toggleHeader,
          appendActionButton,
          setHeaderStyles,
          setWindowView: (show: boolean) =>
            show
              ? container.classList.remove("hidden")
              : container.classList.add("hidden"),
          toggleFullScreen: () =>
            toggleFullScreen(this.contentRef.current!, container),
          getBoundingClientRect: () => container.getBoundingClientRect(),
          setBoundingClientRect: (rect: Record<string, number>) => {
            const newCord: Record<string, string> = {}
            Object.keys(rect).forEach(
              (attr: any) =>(newCord[attr] = `${rect[attr]}${typeof rect[attr] === "number" ? "px" : ""}`)
            );
            Object.assign(container.style, newCord);
          },
          host: hostDimention
        },
        ...args
      );

      draggable(container, head);
      this.moveOnTop(windowRef);
      head.addEventListener("mousedown", () => this.moveOnTop(windowRef));
    };

    if (this.contentRef.current) {
      // contentRef.current.innerText = ''
      container.appendChild(iframe);
      appendWindow(this.contentRef.current, container);
      closeButton.onclick = () => container.remove();
      fullScreenButton.onclick = () =>
        toggleFullScreen(this.contentRef.current!, container);
    }
  }

  private closeWindow(windowRef: {
    command: Command;
    container: HTMLDivElement;
  }) {
    if (!this.windows[windowRef.command.name]) return;

    this.windows[windowRef.command.name]
      .find((x) => x === windowRef)
      ?.container.remove();
    this.windows[windowRef.command.name] = this.windows[
      windowRef.command.name
    ].filter((x) => x != windowRef);
  }

  private moveOnTop(windowRef: {
    command: Command;
    container: HTMLDivElement;
  }) {
    Object.values(this.windows).forEach((wins) =>
      wins.forEach((win) => win.container.classList.remove("top"))
    );
    windowRef.container.classList.add("top");
  }
}

const createWindoeHeader = (command: Command) => {
  const head = platform.window.document.createElement("div");

  const title = platform.window.document.createElement("span");
  const icon = platform.window.document.createElement("span");
  const titleText = platform.window.document.createElement("span");
  titleText.innerHTML = (command.meta.title as string) || command.name;
  title.appendChild(icon);
  title.appendChild(titleText);
  title.classList.add("title");

  icon.classList.add("material-symbols-outlined");
  icon.style.cursor = "pointer";
  icon.style.marginLeft = "auto";
  icon.innerHTML = `${command.meta?.icon}`;

  const gap = platform.window.document.createElement("span");
  gap.style.marginLeft = "auto";
  const fullScreen = platform.window.document.createElement("span");
  fullScreen.classList.add("material-symbols-outlined");
  fullScreen.style.cursor = "pointer";
  fullScreen.innerHTML = "fullscreen";
  fullScreen.title = "toggle fullscreen";
  fullScreen.onclick = () => {
    console.log(command);
  };

  const close = platform.window.document.createElement("span");
  close.classList.add("material-symbols-outlined");
  close.style.cursor = "pointer";
  close.innerHTML = "close";
  close.title = "close window";
  close.onclick = () => {
    console.log(command);
  };

  head.appendChild(title);
  head.appendChild(gap);
  head.appendChild(fullScreen);
  head.appendChild(close);

  head.classList.add("window-header");

  const setHeaderStyles = (styles: Record<string, string>) => {
    Object.assign(head.style, styles)
  }

  const headerStyles = (command.meta?.header as any)?.style || {};
  setHeaderStyles(headerStyles)

  const setTitle = (title: string) => {
    titleText.innerText = title;
  };

  const appendActionButton = (props: {
    icon: string;
    title: string;
    onClick: () => void;
  }) => {
    const newButton = platform.window.document.createElement("span");
    newButton.classList.add("material-symbols-outlined");
    newButton.style.cursor = "pointer";
    newButton.innerHTML = props.icon;
    newButton.title = props.title;
    newButton.onclick = props.onClick;
    gap.after(newButton);

    return {
      remove: () => newButton.remove(),
    };
  };

  return [head, close, fullScreen, setTitle, appendActionButton, setHeaderStyles] as const;
};

const appendWindow = (
  contentArea: HTMLDivElement,
  windowElement: HTMLElement
) => {
  if (!contentArea.querySelector(`:scope > .${WINDOWS_CONTAINER_CLASS}`)) {
    const windowsContainer = platform.window.document.createElement("div");
    windowsContainer.classList.add(WINDOWS_CONTAINER_CLASS);
    contentArea.appendChild(windowsContainer);
  }

  contentArea
    .querySelector(`:scope > .${WINDOWS_CONTAINER_CLASS}`)!
    .appendChild(windowElement);
};

const toggleFullScreen = (contentArea: HTMLElement, win: HTMLElement) => {
  const container = contentArea; // contentArea.querySelector(`:scope > .${WINDOWS_CONTAINER_CLASS}`)

  const isFullScreen = (win.getAttribute("data-fullscreen") || "false") === "true";
  win.setAttribute("data-fullscreen", isFullScreen ? "false" : "true");

  const mergeAttributes = ["height", "width", "left", "right", "top"] as const;

  if (isFullScreen) {
    mergeAttributes.forEach(
      (attr) => (win.style[attr] = `${win.getAttribute(`data-prev-${attr}`)}`)
    );
  } else {
    const containerRect = container?.getBoundingClientRect();
    mergeAttributes.forEach((attr) =>
      win.setAttribute(`data-prev-${attr}`, win.style[attr])
    );
    mergeAttributes.forEach(
      (attr) => (win.style[attr] = `${containerRect[attr]}px`)
    );
  }

  // if (platform.window.document.fullscreenElement) {
  //     platform.window.document
  //     .exitFullscreen()
  //     .then(() => console.log("Document Exited from Full screen mode"))
  //     .catch((err) => console.error(err));
  // } else {
  //     win.requestFullscreen();
  // }
};
