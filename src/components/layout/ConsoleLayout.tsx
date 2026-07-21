import React from "react";
import ConsoleNavbar from "./ConsoleNavbar";
import { ConsoleDashboardProps } from "@Jetzy/types";
import Link from "next/link";
import { BackArrowSVG } from "@/assets/icons";
import { Flex, Text } from "@chakra-ui/react";

export default function ConsoleLayout({
  page,
  children,
  component,
  backBtn,
  maxW,
  stickyHeader,
}: ConsoleDashboardProps) {
  const headerRef = React.useRef<HTMLElement>(null);

  // Publish the pinned header's height as --console-header-h so page content
  // (e.g. the manage page's tab bar) can stick directly beneath it.
  React.useEffect(() => {
    if (!stickyHeader) return;
    const el = headerRef.current;
    if (!el) return;

    const publish = () =>
      document.documentElement.style.setProperty(
        "--console-header-h",
        `${el.getBoundingClientRect().height}px`
      );

    publish();

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    observer?.observe(el);

    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty("--console-header-h");
    };
  }, [stickyHeader]);

  return (
    <div className="min-h-full">
      {/* Navbar */}
      <ConsoleNavbar page={page} />
      <header
        ref={headerRef}
        className={`bg-[#090C10] shadow ${
          stickyHeader
            ? "sticky top-0 z-30 pb-4 border-b border-[#232323]"
            : ""
        }`}
      >
        <div
          className={`mx-auto px-4 pt-6 xs:px-6 lg:px-8 flex md:flex-row xs:flex-col justify-between gap-4 ${
            maxW ? maxW : "max-w-7xl"
          }`}
        >
          <Flex flexDirection="column">
            {backBtn && (
              <Link href={backBtn as string} className="w-max mb-5">
                <Flex
                  alignItems="center"
                  gap="1"
                  border="1px solid #4E4E4E"
                  rounded="lg"
                  px="3"
                  py="1"
                >
                  <BackArrowSVG />
                  <Text>Back</Text>
                </Flex>
              </Link>
            )}
            {page && <h1 className="text-3xl font-bold tracking-tight w-full">{page}</h1>}
          </Flex>
          {component}
        </div>
      </header>
      <main>
        <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8 ">
          {children}
        </div>
      </main>
    </div>
  );
}
