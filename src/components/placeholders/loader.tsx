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
