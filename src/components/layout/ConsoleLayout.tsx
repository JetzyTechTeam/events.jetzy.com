import React from "react";
import ConsoleNavbar from "./ConsoleNavbar";
import { ConsoleDashboardProps } from "@Jetzy/types";
import Link from "next/link";
import { BackArrowSVG } from "@/assets/icons";
import { Flex, Text } from "@chakra-ui/react";
import { useSession } from "next-auth/react";

export default function ConsoleLayout({
  page,
  children,
  component,
  backBtn,
  maxW,
}: ConsoleDashboardProps) {
  const { data: session } = useSession();
  // @ts-ignore
  const userRole = session?.user?.role;
  const userName = session?.user?.name || (session?.user as any)?.fullName;
  const isSuperAdmin =
    userRole === "super admin" ||
    userName?.toLowerCase() === "super admin";

  return (
    <div className="min-h-full">
      {/* Navbar */}
      <ConsoleNavbar page={page} />
      {isSuperAdmin ? (
        <>
          <header className="bg-[#090C10] shadow">
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
        </>
      ) : (
        <main>
          <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
            <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">Coming Soon</h1>
            <p className="text-gray-400 text-lg max-w-md">
              Something exciting is on the way. Stay tuned.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
