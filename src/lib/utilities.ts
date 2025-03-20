export const extractToken = (token: string): string => {
  return token.split("|")[1]
}

export const generateRatings = (ratings: number): number[] => {
  let Rating = []
  /* Create rating base on rating value */
  if (ratings) {
    for (let index = 1; index <= ratings; index++) {
      Rating.push(index)
    }
  }

  return Rating
}

export const encryptString = (data: string | any): string | any => {
  return btoa(data)
}

export const decryptString = (encryptedString: string | any): string | any => {
  return atob(encryptedString)
}

export const reloadSession = () => {
  const event = new Event("visibilitychange")
  document.dispatchEvent(event)
}

export const formatNumber = (num: any) => `${Intl.NumberFormat().format(parseInt(num))}.00`

export const calculateVAT = (amount: number) => (parseInt(process.env.NEXT_PUBLIC_APP_VAT as string) / 100) * amount

export function capitalizeEachWord(input: string): string {
  return input.replace(/\b\w/g, (match) => match.toUpperCase())
}
