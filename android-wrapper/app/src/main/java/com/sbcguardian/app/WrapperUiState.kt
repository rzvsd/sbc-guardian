package com.sbcguardian.app

sealed interface WrapperUiState {
    data object Loading : WrapperUiState
    data object Ready : WrapperUiState
    data class Error(val message: String) : WrapperUiState
}
