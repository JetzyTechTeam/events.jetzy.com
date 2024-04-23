import { ResolveSubdomainSlug } from "@JB/services/subdomain/subdomainapis"
import { BusinessResponseInterface, SiteAppConfigs } from "@JB/types"

const siteDefaultSubomainConfigs = {
  app: {
    name: "Juray Business",
    desc: "Juray Businesses App",
    logo: `/logo.png`,
    favicon: `/favicon.ico`, // fallbacke to default favicon
    business: undefined,
  },
  console: {
    name: "Juray Business",
    desc: "Juray Businesses Admin Console",
    logo: `/logo.png`,
    favicon: `/favicon.ico`,
    business: undefined,
  },
}

/**
 * Fetch the subdomain data
 * @param subdomain string
 */
export const resolveSubdomain = async (subdomain: string): Promise<boolean | SiteAppConfigs> => {
  try {
    // handle default allowed subdomain

    // for the app
    if (subdomain === "app") return siteDefaultSubomainConfigs.app

    // for admin console
    if (subdomain === "console") return siteDefaultSubomainConfigs.console

    // resolve the subdomain slug
    const response = await ResolveSubdomainSlug({ id: subdomain })

    if (!response?.status) return false

    return {
      name: response?.data?.name,
      desc: response?.data?.desc,
      logo: response?.data?.logo,
      favicon: response?.data?.logo, // use the logo as favicon
      business: response?.data as BusinessResponseInterface,
    }
  } catch (error) {
    return false
  }
}
