import { ListGroupProps } from "@Jetzy/types"
import React from "react"

const ListGroup: React.FC<ListGroupProps> = ({ items }) => {
  return (
    <div className="divide-y divide-gray-200">
      {items.map((item) => (
        <div key={item.id} className="py-4">
          <p className="text-sm text-gray-900">{item.text}</p>
        </div>
      ))}
    </div>
  )
}

export default ListGroup
