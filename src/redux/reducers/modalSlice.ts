import { createSlice } from "@reduxjs/toolkit"
import { HYDRATE } from "next-redux-wrapper"
import { AppState } from "../stores"
import { ModalSliceState } from "@JB/types"

// Initial state
const initialState: ModalSliceState = {
  param: "", // most this would be ID passed by togglers
  // Category
  createCategory: false,
  updateCategory: false,

  // Product category
  createProductCategory: false,
  updateProductCategory: false,

  // Food Product variant
  createFoodProductVariant: false,
  updateFoodProductVariant: false,

  // Fashion product variant
  createFashionProductVariant: false,
  updateFashionProductVariant: false,
}

// Actual Slice
export const modalSlice = createSlice({
  name: "modals",
  initialState,
  reducers: {
    // Action to set the authentication status
    toggleCreateCategory(state, action) {
      state.createCategory = action?.payload
    },

    toggleCategoryWithParams(state, action) {
      state.updateCategory = action?.payload?.status
      state.param = action?.payload?.param
    },

    toggleCreateProductCategory(state, action) {
      state.createProductCategory = action?.payload
    },

    toggleUpdateProductCategory(state, action) {
      state.updateProductCategory = action?.payload?.status // status
      state.param = action?.payload?.param // param
    },

    // ------------- [ Food Product Variant ] ---------------
    toggleCreateFoodProductVariant(state, action) {
      state.createFoodProductVariant = action?.payload
    },
    toggleUpdateFoodProductVariant(state, action) {
      state.updateFoodProductVariant = action?.payload?.status
      state.param = action?.payload?.param
    },

    // Special reducer for hydrating the state. Special case for next-redux-wrapper
    extraReducers: {
      // @ts-ignore
      [HYDRATE]: (state, action) => {
        return {
          ...state,
          ...action.payload,
        }
      },
    },
  },
})

export const { toggleCreateCategory, toggleCategoryWithParams, toggleCreateProductCategory, toggleUpdateProductCategory, toggleCreateFoodProductVariant, toggleUpdateFoodProductVariant } =
  modalSlice.actions

export const getModalState = (state: AppState) => state?.modals

export default modalSlice
