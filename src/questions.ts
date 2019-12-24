import { IQuestion, IEntry, IQuestionChoice } from './interfaces';

const QSearch: IQuestion = {
    type: "input",
    name: "qsearch",
    message: "Search: "
}

const getQuestionChoices = (entries: IEntry[]): IQuestionChoice[] => {
    let choices: IQuestionChoice[] = [];

    choices = entries.map(e => ({
        //name: `<${e.ID}> ${e.Title} | (${e.Author}) - ${e.Publisher}`,
        name: `<${e.ID}> ${e.Title}`,
        value: ''
    }));

    return choices;
}

const getListQuestion = (entries: IEntry[]): IQuestion => {
    return {
        type: 'list',
        message: 'Results: ',
        name: 'rlist',
        choices: getQuestionChoices(entries)
    }
}

export default {
    QSearch,
    getListQuestion
};