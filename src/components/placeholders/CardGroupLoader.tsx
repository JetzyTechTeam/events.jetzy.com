import React from "react"

export default function CardGroupLoader() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <div className="bg-white shadow-md rounded-lg overflow-hidden relative">
        {/* Image Placeholder with Animation */}
        <div className="animate-pulse h-48 w-full bg-gray-200 rounded-lg overflow-hidden"></div>

        {/* Content */}
        <div className="p-4">
          <h3 className="animate-pulse h-8 text-lg font-semibold text-gray-800"> </h3>
          <p className=" animate-pulse h-5 mt-2 text-sm text-gray-600"> </p>
        </div>
      </div>
    </div>
  )
}
