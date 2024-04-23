import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { ROUTES } from "@Jetzy/configs/routes"
import { authorizedOnly } from "@Jetzy/lib/authSession"
import { Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Link from "next/link"

const CreateEventButton = () => {
  return (
    <div className="w-full px-5 flex justify-end">
      <Link href={ROUTES.dashboard.events.create} className="p-3 bg-app rounded-3xl">
        Create Event
      </Link>
    </div>
  )
}
export default function ConsoleDashboard() {
  return (
    <ConsoleLayout page={Pages.Dasshboard} component={<CreateEventButton />}>
      <p className="text-white">Hello world</p>
    </ConsoleLayout>
  )
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
  return authorizedOnly(context)
}
