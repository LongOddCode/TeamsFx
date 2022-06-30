import {
  Inputs,
  MultiSelectQuestion,
  OptionItem,
  QTreeNode,
  SingleSelectQuestion,
} from "@microsoft/teamsfx-api";
import { CoreQuestionNames } from "../../../core/question";

export enum QuestionName {
  ExampleSingleSelectQuestion = "example-single-select",
  ExampleMultiSelectQuestion = "example-multi-select",
  ExampleQuestionForJs = "example-question-js",
  ExampleQuestionForTs = "example-question-ts",
}

export const SingleSelectOptionOne: OptionItem = {
  id: "option1",
  label: "Option 1 label",
  detail: "Option 1 detail",
  groupName: "group1",
};

export const SingleSelectOptionTwo: OptionItem = {
  id: "option2",
  label: "Option 2 label",
  detail: "Option 2 detail",
  groupName: "group1",
};

export const SingleSelectOptionThree: OptionItem = {
  id: "option3",
  label: "Option 3 label",
  detail: "Option 3 detail",
  groupName: "group2",
};

// TODO: localize the strings
export const ExampleSingleSelectQuestion: SingleSelectQuestion = {
  type: "singleSelect",
  name: QuestionName.ExampleSingleSelectQuestion,
  title: "This is a single select question",
  staticOptions: [SingleSelectOptionOne, SingleSelectOptionTwo, SingleSelectOptionThree],
  default: SingleSelectOptionOne.id,
  placeholder: "This is placeholder",
};

export const MultiSelectOptionOne: OptionItem = {
  id: "multi-option1",
  label: "Option 1 label",
  detail: "Option 1 detail",
};

export const MultiSelectOptionTwo: OptionItem = {
  id: "multi-option2",
  label: "Option 2 label",
  detail: "Option 2 detail",
};

export const ExampleMultiSelectQuestion: MultiSelectQuestion = {
  name: QuestionName.ExampleMultiSelectQuestion,
  title: "This is a multi-select question",
  type: "multiSelect",
  staticOptions: [MultiSelectOptionOne, MultiSelectOptionTwo],
  default: undefined,
  placeholder: "This is placeholder",
};

export const ExampleQuestionForJs: SingleSelectQuestion = {
  type: "singleSelect",
  name: QuestionName.ExampleQuestionForJs,
  title: "This question only shows if programming language is JavaScript",
  staticOptions: [SingleSelectOptionOne, SingleSelectOptionTwo],
  default: SingleSelectOptionOne.id,
  placeholder: "This is placeholder",
};

export function createExampleQuestionNodeForJs(): QTreeNode {
  const node = new QTreeNode(ExampleQuestionForJs);
  node.condition = {
    validFunc: async (input: unknown, inputs?: Inputs) => {
      // inspect the answer to previous questions and decide whether this question shows
      if (inputs && inputs[CoreQuestionNames.ProgrammingLanguage] === "javascript") {
        // return undefined you want this question to show.
        return undefined;
      } else {
        // return a string if validation failed. The question won't show.
        return "language is not js";
      }
    },
  };

  return node;
}

export const ExampleQuestionForTs: SingleSelectQuestion = {
  type: "singleSelect",
  name: QuestionName.ExampleQuestionForTs,
  title: "This question only shows if programming language is TypeScript",
  staticOptions: [SingleSelectOptionOne, SingleSelectOptionTwo],
  default: SingleSelectOptionOne.id,
  placeholder: "This is placeholder",
};

export function createExampleQuestionNodeForTs(): QTreeNode {
  const node = new QTreeNode(ExampleQuestionForTs);
  node.condition = {
    validFunc: async (input: unknown, inputs?: Inputs) => {
      // inspect the answer to previous questions and decide whether this question shows
      if (inputs && inputs[CoreQuestionNames.ProgrammingLanguage] === "typescript") {
        // return undefined you want this question to show.
        return undefined;
      } else {
        // return a string if validation failed. The question won't show.
        return "language is not ts";
      }
    },
  };

  return node;
}
