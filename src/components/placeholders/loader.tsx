export const EventListingLoader: React.FC<any> = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
      {/* Skeleton elements for each item */}
      {[...Array(4)].map((_, index) => (
        <div key={index} className="bg-gray-200 animate-pulse shadow-md rounded-lg overflow-hidden relative">
          <div className="h-48 bg-gray-300 animate-pulse w-full"></div>
          <div className="p-4">
            <div className="h-5 bg-gray-300 animate-pulse rounded-md mb-2"></div>
            <div className="h-4 bg-gray-300 animate-pulse rounded-md mb-2"></div>
            <div className="h-4 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          </div>
          <div className=" absolute top-auto bottom-0 left-0 right-0">
            <div className="h-10 bg-gray-300 animate-pulse w-full"></div>
          </div>
        </div>
      ))}
    </div>
  )
}

export const EventInfoLoader = () => {
  return (
    <div className="mb-32 text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:text-left">
      <section className="bg-gray-200 animate-pulse w-full text-gray-500 min-h-screen rounded">
        <div className="p-8">
          <div className="h-72 bg-gray-300 animate-pulse rounded-md mb-4 "></div>
          <div className="h-10 bg-gray-300 animate-pulse rounded-md mb-4"></div>
          <div className="grid md:grid-cols-2 xs:grid-cols-1 gap-4">
            <div className="h-10 bg-gray-300 animate-pulse rounded-md mb-2"></div>
            <div className="flex gap-8 items-center justify-center">
              <div className="h-10 w-10 bg-gray-300 animate-pulse rounded-3xl mb-2"></div>
              <div className="h-10 w-10 bg-gray-300 animate-pulse rounded-3xl mb-2"></div>
              <div className="h-10 w-10 bg-gray-300 animate-pulse rounded-md mb-2"></div>
            </div>
          </div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-2"></div>
          {/* Info */}
          <div className="h-6 w-2/5 bg-gray-300 animate-pulse rounded-md mb-2"></div>
          <div className="h-6 w-2/4 bg-gray-300 animate-pulse rounded-md mb-2"></div>
          <div className="h-6 w-11/12 bg-gray-300 animate-pulse rounded-md mb-2"></div>
          <div className="h-6 w-2/5 bg-gray-300 animate-pulse rounded-md mb-2"></div>

          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
          <div className="h-6 bg-gray-300 animate-pulse rounded-md mb-10"></div>
        </div>
      </section>
    </div>
  )
}
