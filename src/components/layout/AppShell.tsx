import { useFocusClearance } from "./use-focus-clearance";
import { useEffect, useRef } from "react";
import { Outlet } from "react-router";
import { useScreenNavigation } from "../../app/navigation-context";
import { ScreenButton } from "../../app/ScreenButton";
import { pages } from "../../app/pages";
import { useWorkspace } from "../../app/workspace-context";
import { Avatar } from "../../features/profiles/Avatar";
import { StorageNotice } from "../../features/profiles/StorageNotice";

export function AppShell() {
  const { screen } = useScreenNavigation();
  const pathname = `/${screen}`;
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  const pointerFocus = useRef(false);
  const revealFocus = useFocusClearance();
  const workspace = useWorkspace();
  useEffect(() => {
    document.title = `${pathname === "/settings" ? "Settings" : (pages.find((page) => page.path === pathname)?.label ?? "Page not found")} | Boros`;
    if (previousPath.current !== pathname) {
      mainRef.current?.focus();
      window.scrollTo(0, 0);
      previousPath.current = pathname;
    }
  }, [pathname]);
  return (
    <div
      className="app-shell"
      onPointerDownCapture={() => { pointerFocus.current = true; }}
      onKeyDownCapture={() => { pointerFocus.current = false; }}
      onClickCapture={(event) => {
        // WebKit does not focus pointer-clicked buttons by default. Give dialogs
        // the actual invoking control to restore, rather than a previous input.
        const button = (event.target as Element).closest("button");
        if (button && !button.disabled) button.focus({ preventScroll: true });
      }}
    >
      <button
        type="button"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView();
        }}
      >
        Skip to content
      </button>
      <header className="app-header">
        <ScreenButton
          to="train"
          className="brand"
          aria-label="Boros home"
          title="Return to Train"
        >
          <img
            className="brand-snake"
            src={`${import.meta.env.BASE_URL}snake.png`}
            alt="Ouroboros: a snake eating its tail"
          />
          <span>
            <img
              className="brand-wordmark"
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Boros"
            />
            <small>Ask not for a lighter burden</small>
          </span>
        </ScreenButton>
        <ScreenButton
          to="settings"
          className="profile-link"
          aria-label="Settings"
          title="Settings"
        >
          <Avatar
            blob={workspace.snapshot.photo?.blob}
            name={workspace.snapshot.profile.name}
          />
        </ScreenButton>
      </header>
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="main-content"
        onFocusCapture={(event) => {
          const control = event.target as HTMLElement;
          if (
            !control.matches("input, textarea, select, button") ||
            control.closest("dialog, .session-actions")
          )
            return;
          // Moving a pointer-focused button between down/up loses its click.
          // Fields still need keyboard clearance; keyboard-focused buttons do too.
          if (control.matches("button") && pointerFocus.current) return;
          revealFocus(control);
        }}
      >
        {!workspace.noticeAccepted && <StorageNotice />}
        <Outlet />
      </main>
      <nav aria-label="Main navigation" className="main-nav">
        {pages
          .filter((page) => page.path !== "/settings")
          .map(({ screen, label, icon: Icon }) => (
            <ScreenButton key={screen} to={screen} className="nav-link">
              <Icon size={23} aria-hidden="true" />
              <span>{label}</span>
            </ScreenButton>
          ))}
      </nav>
    </div>
  );
}
